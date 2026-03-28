import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
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
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeInUp, SlideInRight } from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  parseSearchQuery,
  getTimeRange,
  getTimeFilterLabel,
  getMediaFilterLabel,
  getMediaAttachmentType,
  type MediaFilter,
  type TimeFilter,
  type ParsedQuery,
} from "@/lib/searchParser";
import {
  getSearchHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getSavedSearches,
  saveSearch,
  removeSavedSearch,
  getPinnedResults,
  pinResult,
  unpinResult,
  type SavedSearch,
  type PinnedResult,
} from "@/lib/searchStore";

const { width: SCREEN_W } = Dimensions.get("window");
const BRAND = "#00C2CB";
const GOLD = "#D4A853";

type SearchCategory = "all" | "people" | "posts" | "chats" | "channels" | "gifts" | "media" | "links" | "hashtags";

const CATEGORIES: { id: SearchCategory; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "apps" },
  { id: "people", label: "People", icon: "people" },
  { id: "posts", label: "Posts", icon: "document-text" },
  { id: "chats", label: "Chats", icon: "chatbubbles" },
  { id: "media", label: "Media", icon: "images" },
  { id: "links", label: "Links", icon: "link" },
  { id: "channels", label: "Channels", icon: "megaphone" },
  { id: "hashtags", label: "Tags", icon: "pricetag" },
  { id: "gifts", label: "Gifts", icon: "gift" },
];

const TIME_OPTIONS: { id: TimeFilter; label: string }[] = [
  { id: null, label: "Any Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "last_week", label: "Last Week" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
];

const MEDIA_OPTIONS: { id: MediaFilter; label: string; icon: string }[] = [
  { id: null, label: "All Types", icon: "grid" },
  { id: "images", label: "Images", icon: "image" },
  { id: "videos", label: "Videos", icon: "videocam" },
  { id: "documents", label: "Files", icon: "document" },
  { id: "voice", label: "Voice", icon: "mic" },
  { id: "links", label: "Links", icon: "link" },
];

const TRENDING_TAGS = [
  "gaming", "photography", "music", "travel", "coding",
  "fitness", "cooking", "art", "fashion", "tech",
  "crypto", "design", "startup", "afuchat",
];

const COMMANDS_HELP = [
  { cmd: "@username", desc: "Search by person" },
  { cmd: "#hashtag", desc: "Search hashtags" },
  { cmd: "/files", desc: "Find documents" },
  { cmd: "/links", desc: "Find shared links" },
  { cmd: "/images", desc: "Find images" },
  { cmd: "/videos", desc: "Find videos" },
  { cmd: "/voice", desc: "Find voice notes" },
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
  image_url: string | null;
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

type MediaResult = {
  id: string;
  attachment_url: string;
  attachment_type: string;
  attachment_name: string | null;
  sender_name: string;
  sender_handle: string;
  chat_id: string;
  sent_at: string;
};

type LinkResult = {
  id: string;
  url: string;
  context: string;
  sender_name: string;
  sender_handle: string;
  chat_id: string;
  sent_at: string;
};

type SearchResults = {
  people: PersonResult[];
  posts: PostResult[];
  chats: ChatResult[];
  channels: ChannelResult[];
  gifts: GiftResult[];
  media: MediaResult[];
  links: LinkResult[];
};

const EMPTY_RESULTS: SearchResults = {
  people: [], posts: [], chats: [], channels: [], gifts: [], media: [], links: [],
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

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  return text.match(urlRegex) || [];
}

type ViewMode = "search" | "history" | "filters";

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [hasSearched, setHasSearched] = useState(false);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [privateMode, setPrivateMode] = useState(false);

  const [history, setHistory] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [pinnedResults, setPinnedResults] = useState<PinnedResult[]>([]);
  const [trendingPeople, setTrendingPeople] = useState<PersonResult[]>([]);
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("search");
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showMediaFilter, setShowMediaFilter] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const [isListening, setIsListening] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const suggestRef = useRef<ReturnType<typeof setTimeout>>();
  const searchIdRef = useRef(0);

  const activeFilters = useMemo(() => {
    const f: string[] = [];
    if (timeFilter) f.push(getTimeFilterLabel(timeFilter));
    if (mediaFilter) f.push(getMediaFilterLabel(mediaFilter));
    if (personFilter) f.push(`@${personFilter}`);
    if (privateMode) f.push("Private");
    return f;
  }, [timeFilter, mediaFilter, personFilter, privateMode]);

  const parsed = useMemo(() => parseSearchQuery(query), [query]);

  useEffect(() => {
    loadInitialData();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestRef.current) clearTimeout(suggestRef.current);
    };
  }, []);

  async function loadInitialData() {
    const [h, s, p] = await Promise.all([getSearchHistory(), getSavedSearches(), getPinnedResults()]);
    setHistory(h);
    setSavedSearches(s);
    setPinnedResults(p);
    loadTrending();
  }

  async function loadTrending() {
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country")
      .eq("is_verified", true)
      .order("xp", { ascending: false })
      .limit(12);
    if (data) setTrendingPeople(data);
  }

  async function fetchSuggestions(text: string) {
    if (text.length < 2) { setSuggestions([]); return; }
    const pattern = `%${text}%`;
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country")
      .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`)
      .order("xp", { ascending: false })
      .limit(5);
    if (data) setSuggestions(data);
  }

  const performSearch = useCallback(async (q: string, cat: SearchCategory, tFilter: TimeFilter, mFilter: MediaFilter, pFilter: string | null) => {
    const p = parseSearchQuery(q);
    const searchText = p.cleanQuery;
    const effectiveTime = p.timeFilter || tFilter;
    const effectiveMedia = p.mediaFilter || mFilter;
    const effectivePerson = p.person || pFilter;

    if (searchText.length < 1 && !p.isHashtagSearch && !effectivePerson && !effectiveMedia) {
      setResults(EMPTY_RESULTS);
      setHasSearched(false);
      return;
    }

    const currentId = ++searchIdRef.current;
    setLoading(true);
    setHasSearched(true);

    const searchAll = cat === "all";
    const pattern = searchText.length >= 1 ? `%${searchText}%` : null;
    const timeRange = getTimeRange(effectiveTime);

    try {
      const promises: Promise<any>[] = [];

      if (searchAll || cat === "people") {
        if (pattern || effectivePerson) {
          let q = supabase
            .from("profiles")
            .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country");
          if (effectivePerson) {
            q = q.or(`handle.ilike.%${effectivePerson}%,display_name.ilike.%${effectivePerson}%`);
          } else if (pattern) {
            q = q.or(`handle.ilike.${pattern},display_name.ilike.${pattern},bio.ilike.${pattern}`);
          }
          promises.push(q.order("xp", { ascending: false }).limit(20));
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "posts" || cat === "hashtags") {
        if (pattern || p.isHashtagSearch) {
          let q = supabase
            .from("posts")
            .select("id, content, image_url, author_id, view_count, created_at");
          if (p.isHashtagSearch && p.hashtag) {
            q = q.ilike("content", `%#${p.hashtag}%`);
          } else if (effectivePerson) {
            const { data: personData } = await supabase
              .from("profiles")
              .select("id")
              .ilike("handle", `%${effectivePerson}%`)
              .limit(5);
            if (personData && personData.length > 0) {
              q = q.in("author_id", personData.map((pd: any) => pd.id));
              if (pattern) q = q.ilike("content", pattern);
            } else {
              promises.push(Promise.resolve({ data: [] }));
              promises.push(Promise.resolve({ data: [] }));
              promises.push(Promise.resolve({ data: [] }));
              promises.push(Promise.resolve({ data: [] }));
              promises.push(Promise.resolve({ data: [] }));
              if (currentId !== searchIdRef.current) return;
              setResults(EMPTY_RESULTS);
              setLoading(false);
              return;
            }
          } else if (pattern) {
            q = q.ilike("content", pattern);
          }
          if (timeRange) {
            q = q.gte("created_at", timeRange.from).lte("created_at", timeRange.to);
          }
          promises.push(q.order("created_at", { ascending: false }).limit(20));
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "chats") {
        if ((pattern || effectivePerson) && user) {
          let q = supabase
            .from("messages")
            .select("id, encrypted_content, sender_id, chat_id, sent_at");
          if (pattern) q = q.ilike("encrypted_content", pattern);
          if (timeRange) {
            q = q.gte("sent_at", timeRange.from).lte("sent_at", timeRange.to);
          }
          promises.push(q.order("sent_at", { ascending: false }).limit(20));
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "channels") {
        if (pattern) {
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
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "gifts") {
        if (pattern) {
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
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "media") {
        if (user) {
          let q = supabase
            .from("messages")
            .select("id, attachment_url, attachment_type, attachment_name, sender_id, chat_id, sent_at")
            .not("attachment_url", "is", null);
          const attType = getMediaAttachmentType(effectiveMedia);
          if (attType) q = q.eq("attachment_type", attType);
          if (pattern) q = q.ilike("encrypted_content", pattern);
          if (timeRange) q = q.gte("sent_at", timeRange.from).lte("sent_at", timeRange.to);
          promises.push(q.order("sent_at", { ascending: false }).limit(30));
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      if (searchAll || cat === "links") {
        if (user) {
          let q = supabase
            .from("messages")
            .select("id, encrypted_content, sender_id, chat_id, sent_at")
            .or("encrypted_content.ilike.%http://%,encrypted_content.ilike.%https://%");
          if (pattern) q = q.ilike("encrypted_content", pattern);
          if (timeRange) q = q.gte("sent_at", timeRange.from).lte("sent_at", timeRange.to);
          promises.push(q.order("sent_at", { ascending: false }).limit(20));
        } else {
          promises.push(Promise.resolve({ data: [] }));
        }
      } else {
        promises.push(Promise.resolve({ data: [] }));
      }

      const [peopleRes, postsRes, chatsRes, channelsRes, giftsRes, mediaRes, linksRes] = await Promise.all(promises);

      if (currentId !== searchIdRef.current) return;

      const people: PersonResult[] = peopleRes.data || [];

      let posts: PostResult[] = [];
      if (postsRes.data && postsRes.data.length > 0) {
        const authorIds = [...new Set((postsRes.data as any[]).map((pp: any) => pp.author_id))];
        const { data: authors } = await supabase
          .from("profiles")
          .select("id, handle, display_name, avatar_url")
          .in("id", authorIds);
        const authorMap = new Map((authors || []).map((a: any) => [a.id, a]));
        posts = (postsRes.data as any[]).map((pp: any) => {
          const author = authorMap.get(pp.author_id) || {} as any;
          return {
            id: pp.id, content: pp.content, image_url: pp.image_url || null,
            author_id: pp.author_id, author_handle: author.handle || "",
            author_name: author.display_name || "", author_avatar: author.avatar_url || null,
            view_count: pp.view_count || 0, created_at: pp.created_at,
          };
        });
      }

      let chats: ChatResult[] = [];
      if (chatsRes.data && chatsRes.data.length > 0) {
        const grouped = new Map<string, any>();
        for (const msg of chatsRes.data as any[]) {
          if (!grouped.has(msg.chat_id)) grouped.set(msg.chat_id, msg);
        }
        const chatIds = [...grouped.keys()];
        const { data: chatData } = await supabase.from("chats").select("id, user1_id, user2_id").in("id", chatIds);
        if (chatData) {
          const otherUserIds = chatData.map((c: any) => c.user1_id === user?.id ? c.user2_id : c.user1_id);
          const { data: otherUsers } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", otherUserIds);
          const userMap = new Map((otherUsers || []).map((u: any) => [u.id, u]));
          chats = chatData.map((c: any) => {
            const otherId = c.user1_id === user?.id ? c.user2_id : c.user1_id;
            const other = userMap.get(otherId) || {} as any;
            const msg = grouped.get(c.id);
            return {
              id: c.id, other_user_handle: other.handle || "", other_user_name: other.display_name || "",
              other_user_avatar: other.avatar_url || null, last_message: msg?.encrypted_content || "",
              updated_at: msg?.sent_at || "",
            };
          });
        }
      }

      const channels: ChannelResult[] = channelsRes.data || [];
      const gifts: GiftResult[] = giftsRes.data || [];

      let media: MediaResult[] = [];
      if (mediaRes.data && mediaRes.data.length > 0) {
        const senderIds = [...new Set((mediaRes.data as any[]).map((m: any) => m.sender_id))];
        const { data: senders } = await supabase.from("profiles").select("id, handle, display_name").in("id", senderIds);
        const senderMap = new Map((senders || []).map((s: any) => [s.id, s]));
        media = (mediaRes.data as any[]).filter((m: any) => m.attachment_url).map((m: any) => {
          const sender = senderMap.get(m.sender_id) || {} as any;
          return {
            id: m.id, attachment_url: m.attachment_url, attachment_type: m.attachment_type || "file",
            attachment_name: m.attachment_name || null, sender_name: sender.display_name || "",
            sender_handle: sender.handle || "", chat_id: m.chat_id, sent_at: m.sent_at,
          };
        });
      }

      let links: LinkResult[] = [];
      if (linksRes.data && linksRes.data.length > 0) {
        const senderIds = [...new Set((linksRes.data as any[]).map((l: any) => l.sender_id))];
        const { data: senders } = await supabase.from("profiles").select("id, handle, display_name").in("id", senderIds);
        const senderMap = new Map((senders || []).map((s: any) => [s.id, s]));
        links = (linksRes.data as any[]).flatMap((l: any) => {
          const urls = extractUrls(l.encrypted_content || "");
          const sender = senderMap.get(l.sender_id) || {} as any;
          return urls.map((url: string) => ({
            id: `${l.id}-${url.slice(0, 20)}`, url, context: (l.encrypted_content || "").slice(0, 120),
            sender_name: sender.display_name || "", sender_handle: sender.handle || "",
            chat_id: l.chat_id, sent_at: l.sent_at,
          }));
        });
      }

      setResults({ people, posts, chats, channels, gifts, media, links });
    } catch (e) {
      console.warn("Search error:", e);
    } finally {
      if (currentId === searchIdRef.current) setLoading(false);
    }
  }, [user]);

  function recordSearch(term: string) {
    if (privateMode) return;
    const trimmed = term.trim();
    if (trimmed.length >= 2) {
      addToHistory(trimmed).then(setHistory);
    }
  }

  function onChangeText(text: string) {
    setQuery(text);
    setShowCommands(text === "/" || text === "@" || text === "#");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suggestRef.current) clearTimeout(suggestRef.current);
    debounceRef.current = setTimeout(() => performSearch(text, category, timeFilter, mediaFilter, personFilter), 450);
    suggestRef.current = setTimeout(() => fetchSuggestions(text), 200);
  }

  function onSubmitSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    const trimmed = query.trim();
    if (trimmed.length >= 1) {
      recordSearch(trimmed);
      performSearch(query, category, timeFilter, mediaFilter, personFilter);
    }
  }

  function onCategoryPress(cat: SearchCategory) {
    setCategory(cat);
    if (cat === "media") setShowMediaFilter(true);
    if (query.trim().length >= 1) {
      performSearch(query, cat, timeFilter, mediaFilter, personFilter);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults(EMPTY_RESULTS);
    setHasSearched(false);
    setSuggestions([]);
    setShowCommands(false);
    inputRef.current?.focus();
  }

  function handleTagPress(tag: string) {
    const t = `#${tag}`;
    setQuery(t);
    recordSearch(t);
    performSearch(t, category, timeFilter, mediaFilter, personFilter);
  }

  function handleHistoryPress(term: string) {
    setQuery(term);
    setViewMode("search");
    performSearch(term, category, timeFilter, mediaFilter, personFilter);
  }

  function handleSuggestionPress(person: PersonResult) {
    setSuggestions([]);
    setQuery(`@${person.handle}`);
    setPersonFilter(person.handle);
    performSearch(`@${person.handle}`, category, timeFilter, mediaFilter, person.handle);
  }

  function toggleSaveSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const existing = savedSearches.find(s => s.query.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      removeSavedSearch(existing.id).then(setSavedSearches);
    } else {
      saveSearch(trimmed, category).then(setSavedSearches);
    }
  }

  async function handlePinResult(type: string, id: string, title: string, subtitle: string, avatar?: string, routePath?: string) {
    const existing = pinnedResults.find(p => p.id === id && p.type === type);
    if (existing) {
      const updated = await unpinResult(id, type);
      setPinnedResults(updated);
    } else {
      const updated = await pinResult({ id, type, title, subtitle, avatar, routePath });
      setPinnedResults(updated);
    }
  }

  function handleShareSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    Share.share({ message: `Search AfuChat for: "${trimmed}"` });
  }

  function applyTimeFilter(f: TimeFilter) {
    setTimeFilter(f);
    setShowTimeFilter(false);
    if (query.trim().length >= 1) {
      performSearch(query, category, f, mediaFilter, personFilter);
    }
  }

  function applyMediaFilter(f: MediaFilter) {
    setMediaFilter(f);
    setShowMediaFilter(false);
    if (query.trim().length >= 1) {
      performSearch(query, category, timeFilter, f, personFilter);
    }
  }

  function clearPersonFilter() {
    setPersonFilter(null);
    if (query.trim().length >= 1) {
      performSearch(query, category, timeFilter, mediaFilter, null);
    }
  }

  function clearAllFilters() {
    setTimeFilter(null);
    setMediaFilter(null);
    setPersonFilter(null);
    if (query.trim().length >= 1) {
      performSearch(query, category, null, null, null);
    }
  }

  function startVoiceSearch() {
    if (Platform.OS !== "web") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setIsListening(false);
      recordSearch(transcript);
      performSearch(transcript, category, timeFilter, mediaFilter, personFilter);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }

  const isQuerySaved = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return savedSearches.some(s => s.query.toLowerCase() === trimmed);
  }, [query, savedSearches]);

  const totalResults =
    results.people.length + results.posts.length + results.chats.length +
    results.channels.length + results.gifts.length + results.media.length + results.links.length;

  function SectionHeader({ title, count, icon }: { title: string; count: number; icon: string }) {
    if (count === 0) return null;
    return (
      <View style={s.sectionHeader}>
        <Ionicons name={icon as any} size={15} color={BRAND} />
        <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={[s.countBadge, { backgroundColor: BRAND + "15" }]}>
          <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{count}</Text>
        </View>
      </View>
    );
  }

  function renderPersonCard(person: PersonResult, index: number) {
    const isPinned = pinnedResults.some(p => p.id === person.id && p.type === "person");
    return (
      <Animated.View key={person.id} entering={FadeInRight.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/contact/${person.id}` as any)}
          onLongPress={() => handlePinResult("person", person.id, person.display_name, `@${person.handle}`, person.avatar_url || undefined)}
        >
          {person.avatar_url ? (
            <Image source={{ uri: person.avatar_url }} style={s.avatar48} />
          ) : (
            <View style={[s.avatar48, { backgroundColor: BRAND + "20", justifyContent: "center", alignItems: "center" }]}>
              <Text style={{ color: BRAND, fontSize: 18, fontFamily: "Inter_700Bold" }}>
                {(person.display_name || "?")[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[s.nameText, { color: colors.text }]} numberOfLines={1}>{person.display_name}</Text>
              {person.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color={person.is_organization_verified ? GOLD : BRAND} />
              )}
              {isPinned && <Ionicons name="pin" size={12} color={GOLD} />}
            </View>
            <Text style={[s.subText, { color: colors.textMuted }]}>@{person.handle}</Text>
            {person.bio ? <Text style={[s.bioText, { color: colors.textSecondary }]} numberOfLines={2}>{person.bio}</Text> : null}
          </View>
          {person.country ? <Text style={{ fontSize: 11, color: colors.textMuted }}>{person.country}</Text> : null}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderPostCard(post: PostResult, index: number) {
    return (
      <Animated.View key={post.id} entering={FadeInDown.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column", gap: 10 }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/contact/${post.author_id}` as any)}
          onLongPress={() => handlePinResult("post", post.id, post.content.slice(0, 60), `@${post.author_handle}`)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {post.author_avatar ? (
              <Image source={{ uri: post.author_avatar }} style={s.avatar32} />
            ) : (
              <View style={[s.avatar32, { backgroundColor: colors.inputBg, justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                  {(post.author_name || "?")[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.nameText, { color: colors.text, fontSize: 13 }]}>{post.author_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{post.author_handle}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(post.created_at)}</Text>
          </View>
          <Text style={[{ color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 }]} numberOfLines={4}>{post.content}</Text>
          {post.image_url ? (
            <Image source={{ uri: post.image_url }} style={{ width: "100%", height: 160, borderRadius: 12 }} resizeMode="cover" />
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{post.view_count}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderChatCard(chat: ChatResult, index: number) {
    return (
      <Animated.View key={chat.id} entering={FadeInRight.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/chat/${chat.id}` as any)}
        >
          {chat.other_user_avatar ? (
            <Image source={{ uri: chat.other_user_avatar }} style={s.avatar42} />
          ) : (
            <View style={[s.avatar42, { backgroundColor: BRAND + "15", justifyContent: "center", alignItems: "center" }]}>
              <Ionicons name="chatbubble" size={16} color={BRAND} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.nameText, { color: colors.text, fontSize: 14 }]}>{chat.other_user_name || `@${chat.other_user_handle}`}</Text>
            <Text style={[s.subText, { color: colors.textSecondary }]} numberOfLines={1}>{chat.last_message}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(chat.updated_at)}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderChannelCard(ch: ChannelResult, index: number) {
    return (
      <Animated.View key={ch.id} entering={FadeInDown.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          {ch.avatar_url ? (
            <Image source={{ uri: ch.avatar_url }} style={[s.avatar44, { borderRadius: 12 }]} />
          ) : (
            <LinearGradient colors={[BRAND, "#00A5AD"]} style={[s.avatar44, { borderRadius: 12, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="megaphone" size={18} color="#fff" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.nameText, { color: colors.text }]}>{ch.name}</Text>
            {ch.description ? <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>{ch.description}</Text> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="people" size={12} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ch.subscriber_count || 0}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderGiftCard(gift: GiftResult, index: number) {
    return (
      <Animated.View key={gift.id} entering={FadeIn.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.giftCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 28 }}>{gift.emoji}</Text>
          <Text style={[{ color: colors.text, fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" }]}>{gift.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Ionicons name="diamond" size={11} color={GOLD} />
            <Text style={{ color: GOLD, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{gift.base_xp_cost}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 9, textTransform: "capitalize" }}>{gift.rarity}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderMediaCard(m: MediaResult, index: number) {
    const isImage = m.attachment_type === "image";
    const isVideo = m.attachment_type === "video";
    return (
      <Animated.View key={m.id} entering={FadeIn.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.mediaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => router.push(`/chat/${m.chat_id}` as any)}
        >
          {isImage ? (
            <Image source={{ uri: m.attachment_url }} style={s.mediaThumbnail} resizeMode="cover" />
          ) : (
            <View style={[s.mediaThumbnail, { backgroundColor: BRAND + "15", alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name={isVideo ? "videocam" : m.attachment_type === "audio" ? "mic" : "document"} size={22} color={BRAND} />
            </View>
          )}
          <Text style={[{ color: colors.text, fontSize: 11, fontFamily: "Inter_500Medium" }]} numberOfLines={1}>
            {m.attachment_name || m.attachment_type}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(m.sent_at)}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderLinkCard(link: LinkResult, index: number) {
    let domain = "";
    try { domain = new URL(link.url).hostname.replace("www.", ""); } catch { domain = link.url.slice(0, 30); }
    return (
      <Animated.View key={link.id} entering={FadeInDown.delay(index * 30).duration(250)}>
        <TouchableOpacity
          style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
          activeOpacity={0.7}
          onPress={() => Linking.openURL(link.url)}
        >
          <View style={[s.avatar42, { backgroundColor: "#3B82F6" + "15", borderRadius: 12, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="link" size={18} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.nameText, { color: "#3B82F6", fontSize: 13 }]} numberOfLines={1}>{domain}</Text>
            <Text style={[s.subText, { color: colors.textSecondary }]} numberOfLines={1}>{link.url}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>via @{link.sender_handle} · {timeAgo(link.sent_at)}</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderSuggestions() {
    if (suggestions.length === 0 || hasSearched) return null;
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[s.suggestionsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {suggestions.map((p, i) => (
          <TouchableOpacity key={p.id} style={s.suggestionRow} onPress={() => handleSuggestionPress(p)}>
            {p.avatar_url ? (
              <Image source={{ uri: p.avatar_url }} style={{ width: 28, height: 28, borderRadius: 14 }} />
            ) : (
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND + "20", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{(p.display_name || "?")[0]}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }]}>{p.display_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>@{p.handle}</Text>
            </View>
            {p.is_verified && <Ionicons name="checkmark-circle" size={13} color={BRAND} />}
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  }

  function renderCommandsHelp() {
    if (!showCommands) return null;
    return (
      <Animated.View entering={FadeIn.duration(200)} style={[s.suggestionsBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[{ color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold", paddingHorizontal: 14, paddingTop: 10, letterSpacing: 1 }]}>COMMANDS</Text>
        {COMMANDS_HELP.map((c, i) => (
          <TouchableOpacity key={c.cmd} style={s.suggestionRow} onPress={() => { setQuery(c.cmd + " "); setShowCommands(false); inputRef.current?.focus(); }}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: BRAND + "15", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{c.cmd[0]}</Text>
            </View>
            <Text style={[{ color: BRAND, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 }]}>{c.cmd}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.desc}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  }

  function renderActiveFilters() {
    if (activeFilters.length === 0) return null;
    return (
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {timeFilter && (
            <TouchableOpacity style={[s.filterChip, { backgroundColor: "#8B5CF6" + "15", borderColor: "#8B5CF6" + "40" }]} onPress={() => setShowTimeFilter(true)}>
              <Ionicons name="time" size={12} color="#8B5CF6" />
              <Text style={{ color: "#8B5CF6", fontSize: 12, fontFamily: "Inter_500Medium" }}>{getTimeFilterLabel(timeFilter)}</Text>
              <TouchableOpacity onPress={() => applyTimeFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={14} color="#8B5CF6" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          {mediaFilter && (
            <TouchableOpacity style={[s.filterChip, { backgroundColor: "#F59E0B" + "15", borderColor: "#F59E0B" + "40" }]} onPress={() => setShowMediaFilter(true)}>
              <Ionicons name="images" size={12} color="#F59E0B" />
              <Text style={{ color: "#F59E0B", fontSize: 12, fontFamily: "Inter_500Medium" }}>{getMediaFilterLabel(mediaFilter)}</Text>
              <TouchableOpacity onPress={() => applyMediaFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={14} color="#F59E0B" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          {personFilter && (
            <TouchableOpacity style={[s.filterChip, { backgroundColor: BRAND + "15", borderColor: BRAND + "40" }]} onPress={clearPersonFilter}>
              <Ionicons name="person" size={12} color={BRAND} />
              <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_500Medium" }}>@{personFilter}</Text>
              <Ionicons name="close-circle" size={14} color={BRAND} />
            </TouchableOpacity>
          )}
          {privateMode && (
            <View style={[s.filterChip, { backgroundColor: "#EF4444" + "15", borderColor: "#EF4444" + "40" }]}>
              <Ionicons name="eye-off" size={12} color="#EF4444" />
              <Text style={{ color: "#EF4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Private</Text>
            </View>
          )}
          {activeFilters.length > 1 && (
            <TouchableOpacity style={[s.filterChip, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={clearAllFilters}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" }}>Clear All</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  function renderFilterModal() {
    if (!showTimeFilter && !showMediaFilter) return null;
    const options = showTimeFilter ? TIME_OPTIONS : MEDIA_OPTIONS;
    const currentValue = showTimeFilter ? timeFilter : mediaFilter;
    return (
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => { setShowTimeFilter(false); setShowMediaFilter(false); }}>
        <Animated.View entering={FadeInUp.duration(250)} style={[s.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.modalTitle, { color: colors.text }]}>{showTimeFilter ? "Time Range" : "Media Type"}</Text>
          {options.map((opt: any) => (
            <TouchableOpacity
              key={String(opt.id)}
              style={[s.modalOption, currentValue === opt.id && { backgroundColor: BRAND + "10" }]}
              onPress={() => showTimeFilter ? applyTimeFilter(opt.id) : applyMediaFilter(opt.id)}
            >
              {opt.icon && <Ionicons name={opt.icon as any} size={18} color={currentValue === opt.id ? BRAND : colors.textMuted} />}
              <Text style={[{ flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: currentValue === opt.id ? BRAND : colors.text }]}>{opt.label}</Text>
              {currentValue === opt.id && <Ionicons name="checkmark-circle" size={18} color={BRAND} />}
            </TouchableOpacity>
          ))}
        </Animated.View>
      </TouchableOpacity>
    );
  }

  function renderPinnedResults() {
    if (pinnedResults.length === 0) return null;
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={s.idleSection}>
        <View style={s.idleSectionHeader}>
          <Ionicons name="pin" size={16} color={GOLD} />
          <Text style={[s.idleSectionTitle, { color: colors.text }]}>Pinned</Text>
        </View>
        {pinnedResults.slice(0, 5).map((p, i) => (
          <TouchableOpacity
            key={`${p.type}-${p.id}`}
            style={[s.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => p.routePath ? router.push(p.routePath as any) : null}
          >
            <Ionicons name="pin" size={14} color={GOLD} />
            <View style={{ flex: 1 }}>
              <Text style={[{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }]}>{p.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{p.subtitle}</Text>
            </View>
            <TouchableOpacity onPress={() => unpinResult(p.id, p.type).then(setPinnedResults)}>
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </Animated.View>
    );
  }

  function renderIdleState() {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {renderPinnedResults()}

        {savedSearches.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.idleSection}>
            <View style={s.idleSectionHeader}>
              <Ionicons name="bookmark" size={16} color={BRAND} />
              <Text style={[s.idleSectionTitle, { color: colors.text }]}>Saved Searches</Text>
            </View>
            <View style={s.tagWrap}>
              {savedSearches.slice(0, 6).map((ss) => (
                <TouchableOpacity
                  key={ss.id}
                  style={[s.savedChip, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]}
                  onPress={() => handleHistoryPress(ss.query)}
                >
                  <Ionicons name="bookmark" size={11} color={BRAND} />
                  <Text style={{ color: BRAND, fontSize: 13, fontFamily: "Inter_500Medium" }}>{ss.query}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {history.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.idleSection}>
            <View style={s.idleSectionHeader}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[s.idleSectionTitle, { color: colors.text }]}>Recent</Text>
              <TouchableOpacity onPress={() => setViewMode("history")}>
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_500Medium" }}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={s.tagWrap}>
              {history.slice(0, 6).map((term, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.recentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => handleHistoryPress(term)}
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
            <Text style={[s.idleSectionTitle, { color: colors.text }]}>Trending</Text>
          </View>
          <View style={s.tagWrap}>
            {TRENDING_TAGS.map((tag) => (
              <TouchableOpacity key={tag} style={[s.trendTag, { backgroundColor: BRAND + "10", borderColor: BRAND + "25" }]} onPress={() => handleTagPress(tag)}>
                <Text style={{ color: BRAND, fontSize: 13, fontFamily: "Inter_500Medium" }}>#{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {trendingPeople.length > 0 && (
          <Animated.View entering={FadeInDown.delay(150).duration(300)} style={s.idleSection}>
            <View style={s.idleSectionHeader}>
              <Ionicons name="star" size={16} color={GOLD} />
              <Text style={[s.idleSectionTitle, { color: colors.text }]}>Top Users</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
              {trendingPeople.map((p) => (
                <TouchableOpacity key={p.id} style={[s.topUserCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.7} onPress={() => router.push(`/contact/${p.id}` as any)}>
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND + "20", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: BRAND, fontSize: 16, fontFamily: "Inter_700Bold" }}>{(p.display_name || "?")[0].toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={[{ color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "center" }]} numberOfLines={1}>{p.display_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={1}>@{p.handle}</Text>
                    {p.is_verified && <Ionicons name="checkmark-circle" size={10} color={BRAND} />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).duration(300)} style={s.idleSection}>
          <View style={s.idleSectionHeader}>
            <Ionicons name="terminal" size={16} color="#8B5CF6" />
            <Text style={[s.idleSectionTitle, { color: colors.text }]}>Quick Commands</Text>
          </View>
          <View style={s.tagWrap}>
            {COMMANDS_HELP.slice(0, 4).map((c) => (
              <TouchableOpacity key={c.cmd} style={[s.cmdChip, { backgroundColor: "#8B5CF6" + "08", borderColor: "#8B5CF6" + "20" }]} onPress={() => { setQuery(c.cmd + " "); inputRef.current?.focus(); }}>
                <Text style={{ color: "#8B5CF6", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{c.cmd}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{c.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(300)} style={s.idleSection}>
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
            ].map((action) => (
              <TouchableOpacity key={action.label} style={[s.quickAction, { backgroundColor: action.color + "08" }]} onPress={() => router.push(action.route as any)} activeOpacity={0.7}>
                <View style={[s.quickActionIcon, { backgroundColor: action.color + "18" }]}>
                  <Ionicons name={action.icon as any} size={20} color={action.color} />
                </View>
                <Text style={[{ color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    );
  }

  function renderHistoryPanel() {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(300)}>
          <View style={[s.idleSectionHeader, { marginBottom: 8 }]}>
            <TouchableOpacity onPress={() => setViewMode("search")} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[s.idleSectionTitle, { color: colors.text }]}>Search History</Text>
            <TouchableOpacity onPress={() => { clearHistory(); setHistory([]); }}>
              <Text style={{ color: "#EF4444", fontSize: 12, fontFamily: "Inter_500Medium" }}>Clear All</Text>
            </TouchableOpacity>
          </View>
          {history.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <Ionicons name="time-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 15, marginTop: 12, fontFamily: "Inter_500Medium" }}>No search history</Text>
              {privateMode && <Text style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>Private mode is on</Text>}
            </View>
          ) : (
            history.map((term, i) => (
              <Animated.View key={`${term}-${i}`} entering={FadeInRight.delay(i * 20).duration(200)}>
                <TouchableOpacity
                  style={[s.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => handleHistoryPress(term)}
                >
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={[{ flex: 1, color: colors.text, fontSize: 14, fontFamily: "Inter_400Regular" }]}>{term}</Text>
                  <TouchableOpacity onPress={() => removeFromHistory(term).then(setHistory)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </Animated.View>
      </ScrollView>
    );
  }

  function renderResults() {
    const showPeople = (category === "all" || category === "people") && results.people.length > 0;
    const showPosts = (category === "all" || category === "posts" || category === "hashtags") && results.posts.length > 0;
    const showChats = (category === "all" || category === "chats") && results.chats.length > 0;
    const showChannels = (category === "all" || category === "channels") && results.channels.length > 0;
    const showGifts = (category === "all" || category === "gifts") && results.gifts.length > 0;
    const showMedia = (category === "all" || category === "media") && results.media.length > 0;
    const showLinks = (category === "all" || category === "links") && results.links.length > 0;

    if (totalResults === 0 && !loading) {
      return (
        <Animated.View entering={FadeIn.duration(300)} style={s.emptyState}>
          <Ionicons name="search-outline" size={52} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>No results found</Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            Try a different term, category, or command
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            {activeFilters.length > 0 && (
              <TouchableOpacity style={[s.emptyBtn, { borderColor: BRAND }]} onPress={clearAllFilters}>
                <Text style={{ color: BRAND, fontSize: 13, fontFamily: "Inter_500Medium" }}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      );
    }

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 120, gap: 6 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {query.trim().length >= 2 && (
          <Animated.View entering={FadeIn.duration(200)} style={s.resultsMeta}>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" }}>
              {totalResults} result{totalResults !== 1 ? "s" : ""}{parsed.isHashtagSearch ? ` for #${parsed.hashtag}` : ""}{parsed.isPersonSearch ? ` from @${parsed.person}` : ""}
            </Text>
          </Animated.View>
        )}

        {showPeople && (
          <View style={s.resultSection}>
            <SectionHeader title="People" count={results.people.length} icon="people" />
            {(category === "all" ? results.people.slice(0, 5) : results.people).map(renderPersonCard)}
          </View>
        )}

        {showPosts && (
          <View style={s.resultSection}>
            <SectionHeader title={category === "hashtags" ? "Tagged Posts" : "Posts"} count={results.posts.length} icon="document-text" />
            {(category === "all" ? results.posts.slice(0, 4) : results.posts).map(renderPostCard)}
          </View>
        )}

        {showChats && (
          <View style={s.resultSection}>
            <SectionHeader title="Messages" count={results.chats.length} icon="chatbubbles" />
            {(category === "all" ? results.chats.slice(0, 4) : results.chats).map(renderChatCard)}
          </View>
        )}

        {showMedia && (
          <View style={s.resultSection}>
            <SectionHeader title="Media" count={results.media.length} icon="images" />
            <View style={s.mediaGrid}>
              {(category === "all" ? results.media.slice(0, 8) : results.media).map(renderMediaCard)}
            </View>
          </View>
        )}

        {showLinks && (
          <View style={s.resultSection}>
            <SectionHeader title="Links" count={results.links.length} icon="link" />
            {(category === "all" ? results.links.slice(0, 4) : results.links).map(renderLinkCard)}
          </View>
        )}

        {showChannels && (
          <View style={s.resultSection}>
            <SectionHeader title="Channels" count={results.channels.length} icon="megaphone" />
            {(category === "all" ? results.channels.slice(0, 4) : results.channels).map(renderChannelCard)}
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
        <View style={[s.searchBar, { backgroundColor: colors.inputBg, borderColor: query.length > 0 ? BRAND + "50" : colors.border }]}>
          <Ionicons name="search" size={18} color={query.length > 0 ? BRAND : colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search or type / for commands..."
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
          {Platform.OS === "web" && (
            <TouchableOpacity onPress={startVoiceSearch} style={{ padding: 4 }}>
              <Ionicons name={isListening ? "radio" : "mic-outline"} size={20} color={isListening ? "#EF4444" : colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            onPress={() => setShowTimeFilter(true)}
            style={[s.headerBtn, timeFilter && { backgroundColor: "#8B5CF6" + "15" }]}
          >
            <Ionicons name="time-outline" size={18} color={timeFilter ? "#8B5CF6" : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowMediaFilter(true)}
            style={[s.headerBtn, mediaFilter && { backgroundColor: "#F59E0B" + "15" }]}
          >
            <Ionicons name="funnel-outline" size={18} color={mediaFilter ? "#F59E0B" : colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPrivateMode(!privateMode)}
            style={[s.headerBtn, privateMode && { backgroundColor: "#EF4444" + "15" }]}
          >
            <Ionicons name={privateMode ? "eye-off" : "eye-off-outline"} size={18} color={privateMode ? "#EF4444" : colors.textMuted} />
          </TouchableOpacity>
          {query.trim().length >= 2 && (
            <>
              <TouchableOpacity onPress={toggleSaveSearch} style={s.headerBtn}>
                <Ionicons name={isQuerySaved ? "bookmark" : "bookmark-outline"} size={18} color={isQuerySaved ? BRAND : colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShareSearch} style={s.headerBtn}>
                <Ionicons name="share-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </>
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
                style={[s.categoryChip, active ? { backgroundColor: BRAND, borderColor: BRAND } : { backgroundColor: "transparent", borderColor: colors.border }]}
                onPress={() => onCategoryPress(cat.id)}
                activeOpacity={0.7}
              >
                <Ionicons name={cat.icon as any} size={13} color={active ? "#fff" : colors.textMuted} />
                <Text style={[s.categoryText, { color: active ? "#fff" : colors.textSecondary }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {renderActiveFilters()}

      {loading && (
        <View style={s.loadingBar}>
          <Animated.View entering={SlideInRight.duration(800)} style={[s.loadingIndicator, { backgroundColor: BRAND }]} />
        </View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>
        {renderSuggestions()}
        {renderCommandsHelp()}
        {viewMode === "history" ? renderHistoryPanel() : hasSearched ? renderResults() : renderIdleState()}
      </View>

      {renderFilterModal()}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 8 },
  searchBar: {
    flexDirection: "row", alignItems: "center", borderRadius: 14,
    paddingHorizontal: 14, height: 44, gap: 10, borderWidth: 1,
  },
  searchInput: {
    flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: "100%",
    ...(Platform.OS === "web" ? { outlineStyle: "none" } as any : {}),
  },
  clearBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2, justifyContent: "flex-end" },
  headerBtn: { padding: 6, borderRadius: 8 },
  categoryBar: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  categoryText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  filterBar: { paddingVertical: 6 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  loadingBar: { height: 2, overflow: "hidden" },
  loadingIndicator: { height: 2, width: "40%", borderRadius: 1 },

  suggestionsBox: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8, overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },

  idleSection: { marginBottom: 20 },
  idleSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  idleSectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  trendTag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  savedChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  cmdChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, gap: 2 },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  topUserCard: { width: 100, alignItems: "center", paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 5 },
  quickActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  quickAction: {
    flex: 1, minWidth: (SCREEN_W - 64) / 2 - 5, maxWidth: (SCREEN_W - 64) / 2 - 5,
    alignItems: "center", paddingVertical: 16, borderRadius: 14, gap: 8,
  },
  quickActionIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth,
  },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  resultSection: { marginBottom: 12 },
  resultsMeta: { paddingHorizontal: 4, paddingBottom: 6 },

  card: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14,
    gap: 12, marginBottom: 6, borderWidth: StyleSheet.hairlineWidth,
  },
  avatar48: { width: 48, height: 48, borderRadius: 24 },
  avatar44: { width: 44, height: 44 },
  avatar42: { width: 42, height: 42, borderRadius: 21 },
  avatar32: { width: 32, height: 32, borderRadius: 16 },
  nameText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  subText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bioText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16, marginTop: 2 },

  giftCard: {
    width: (SCREEN_W - 56) / 4, alignItems: "center", paddingVertical: 12,
    borderRadius: 14, gap: 3, borderWidth: StyleSheet.hairlineWidth,
  },
  giftsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaCard: {
    width: (SCREEN_W - 56) / 3, alignItems: "center", borderRadius: 12,
    overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, paddingBottom: 8, gap: 4,
  },
  mediaThumbnail: { width: "100%", height: 80, borderTopLeftRadius: 12, borderTopRightRadius: 12 },

  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },

  modalOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end", zIndex: 100,
  },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, paddingHorizontal: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", marginBottom: 16, paddingHorizontal: 4 },
  modalOption: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12,
    paddingVertical: 14, borderRadius: 12,
  },
});
