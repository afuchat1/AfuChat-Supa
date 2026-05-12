import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInRight } from "react-native-reanimated";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as Haptics from "@/lib/haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { supabase } from "@/lib/supabase";
import { getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import {
  getSearchHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getSavedSearches,
  removeSavedSearch,
  type SavedSearch,
} from "@/lib/searchStore";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = "#00BCD4";
const PURPLE  = "#8B5CF6";
const GOLD    = "#D4A853";
const SUCCESS = "#34C759";
const WARN    = "#FF9500";
const RED     = "#FF3B30";
const INDIGO  = "#5856D6";

const RARITY_COLORS: Record<string, string> = {
  common: "#9E9E9E", uncommon: BRAND, rare: "#2979FF",
  epic: "#CE93D8", legendary: "#FFB74D",
};

const FALLBACK_TAGS = [
  "gaming", "photography", "music", "travel", "coding",
  "fitness", "cooking", "art", "fashion", "tech", "crypto", "design",
  "business", "sports", "movies", "food", "nature", "education",
];

type SearchTab = "all" | "people" | "posts" | "videos" | "channels" | "events" | "gifts" | "market" | "jobs";
type SortMode  = "relevance" | "recent" | "popular";
type DateRange = "all" | "24h" | "7d" | "30d";

const TABS: { id: SearchTab; label: string; icon: string }[] = [
  { id: "all",      label: "All",      icon: "apps" },
  { id: "people",   label: "People",   icon: "people" },
  { id: "posts",    label: "Posts",    icon: "document-text" },
  { id: "videos",   label: "Videos",   icon: "play-circle" },
  { id: "channels", label: "Channels", icon: "megaphone" },
  { id: "events",   label: "Events",   icon: "calendar" },
  { id: "jobs",     label: "Jobs",     icon: "briefcase" },
  { id: "gifts",    label: "Gifts",    icon: "gift" },
  { id: "market",   label: "Market",   icon: "storefront" },
];

const CATEGORIES = [
  { id: "people",   label: "People",   icon: "people",        gradient: [BRAND,  "#0097A7"]   as [string,string] },
  { id: "posts",    label: "Posts",    icon: "document-text", gradient: ["#007AFF","#5AC8FA"] as [string,string] },
  { id: "videos",   label: "Videos",   icon: "play-circle",   gradient: [RED,    "#FF6B6B"]   as [string,string] },
  { id: "channels", label: "Channels", icon: "megaphone",     gradient: [PURPLE, "#A855F7"]   as [string,string] },
  { id: "events",   label: "Events",   icon: "calendar",      gradient: [WARN,   "#FFCC00"]   as [string,string] },
  { id: "jobs",     label: "Jobs",     icon: "briefcase",     gradient: [SUCCESS,"#30D158"]   as [string,string] },
  { id: "gifts",    label: "Gifts",    icon: "gift",          gradient: [GOLD,   "#F59E0B"]   as [string,string] },
  { id: "market",   label: "Market",   icon: "storefront",    gradient: [INDIGO, "#7986CB"]   as [string,string] },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonResult  = { id:string; handle:string; display_name:string; avatar_url:string|null; bio:string|null; is_verified:boolean; is_organization_verified:boolean; current_grade:string; country:string|null; xp?:number; kind:"profile" };
type OrgPageResult = { id:string; name:string; slug:string; logo_url:string|null; description:string|null; kind:"org" };
type PostResult    = { id:string; content:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; post_type:string; article_title:string|null };
type VideoResult   = { id:string; content:string; video_url:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; audio_name:string|null; duration_seconds:number|null };
type ChannelResult = { id:string; name:string; description:string|null; avatar_url:string|null; subscriber_count:number };
type GroupResult   = { id:string; name:string; description:string|null; avatar_url:string|null; member_count:number };
type EventResult   = { id:string; title:string; description:string|null; emoji:string; price:number; event_date:string; capacity:number; tickets_sold:number; category:string|null; creator_name:string; creator_handle:string };
type GiftResult    = { id:string; name:string; emoji:string; base_xp_cost:number; rarity:string; description:string|null };
type MarketResult  = { id:string; kind:"product"|"freelance"|"community"; title:string; desc:string|null; emoji:string|null; image_url:string|null; price:number; badge:string|null; seller_name:string; route:string };
type JobResult     = { id:string; title:string; job_type:string|null; location:string|null; description:string|null; apply_url:string|null; created_at:string; company_name:string; company_logo:string|null; company_slug:string|null };
type AiInsight     = { summary:string; suggestions:string[]; intent:string; bestCategory:string; keyTerms:string[]; explanation:string };

type AllResults = {
  people:   (PersonResult|OrgPageResult)[];
  posts:    PostResult[];
  videos:   VideoResult[];
  channels: ChannelResult[];
  groups:   GroupResult[];
  events:   EventResult[];
  gifts:    GiftResult[];
  market:   MarketResult[];
  jobs:     JobResult[];
};

const EMPTY: AllResults = { people:[], posts:[], videos:[], channels:[], groups:[], events:[], gifts:[], market:[], jobs:[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function dateRangeCutoff(range: DateRange): string | null {
  if (range === "all") return null;
  const ms = range === "24h" ? 86400000 : range === "7d" ? 604800000 : 2592000000;
  return new Date(Date.now() - ms).toISOString();
}

// ─── AI Insight Fetcher ───────────────────────────────────────────────────────

async function fetchAiInsight(query: string): Promise<AiInsight | null> {
  try {
    const res = await fetch(`${getEdgeFnBase()}/ai-chat`, {
      method: "POST",
      headers: edgeHeaders(),
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are AfuChat's intelligent search assistant. You have deep knowledge of every feature on the AfuChat platform. Use this knowledge to analyze search queries and guide users to exactly what they need.

## PLATFORM OVERVIEW
AfuChat is a fully-featured African-focused social super-app combining social networking, content creation, commerce, and communication. It serves students, professionals, creators, businesses, and communities.

## SEARCH CATEGORIES — what each one contains:

**people** — User profiles and organisation pages. Profiles have: display name, @handle, bio, avatar, XP (experience points), ACoins (virtual currency), grade/level (e.g. Rookie, Explorer, Star, Legend), country, interests, verified badge (blue = individual, gold = organisation/business), premium tier (Silver/Gold/Platinum), follow counts. Organisations have a logo, description, and slug. Search by name, username, profession, country, or topic expertise.

**posts** — Short text posts, photo posts (single or multi-image galleries), long-form articles with a title, and mixed media posts. Posts have: hashtags (#topic), mentions (@user), like/comment/share counts, view counts, visibility (public/followers/private), and can be boosted. Use for finding opinions, discussions, news, tutorials, announcements, or user-generated stories on any topic.

**videos** — Short-form and long-form video content (like Shorts/Reels). Videos have: view counts, audio/music attribution (audio_name), thumbnail, and duration. Creators post tutorials, entertainment, vlogs, educational content, product demos, comedy, music videos, and event highlights. Great for visual content, how-tos, and trending clips.

**channels** — Broadcast channels where creators/organisations publish updates to subscribers (like Telegram channels or WhatsApp channels). Have subscriber counts and are typically run by influencers, brands, news outlets, schools, businesses, or community leaders. Search when looking for official updates, newsletters, fan channels, or topic-specific feeds.

**events** — Ticketed or free real-world and virtual events. Events have: title, description, emoji, date, price (0 = free), capacity, tickets sold, category (e.g. Education, Tech, Music, Business, Sports, Arts), and the creator's name. Great for conferences, workshops, meetups, parties, concerts, webinars, and community gatherings.

**gifts** — Virtual digital gifts that users send to each other in chats or on profiles. Gifts have: name, emoji, XP cost, rarity (Common, Rare, Epic, Legendary), and a description. They are part of AfuChat's social gifting and appreciation system. Search when looking for a specific gift to send or gifting options.

**market** — AfuChat's marketplace with three sub-types:
  • Products — physical or digital items for sale (gadgets, clothing, art, templates, e-books, courses)
  • Freelance services — skills offered for hire (design, coding, writing, photography, tutoring, translation)
  • Communities — paid or free membership groups around shared interests (study groups, professional networks, fan clubs)
  All have: title, description, emoji, price, seller name, and optional images.

**jobs** — Job and internship listings posted by companies on the platform. Jobs have: title, company name, company logo, job type (Full-time / Part-time / Remote / Freelance / Internship), location, description, and apply URL. Search when looking for work opportunities, internships, or hiring prospects.

## SOCIAL & PLATFORM MECHANICS (inform your analysis):
- **XP & Grades**: Users earn XP through activity. Grades go: Rookie → Explorer → Achiever → Star → Master → Legend. Higher-grade users are more active and influential.
- **ACoins**: Virtual currency used for gifts, marketplace, boosting posts, and premium features.
- **Subscriptions**: Free / Silver / Gold / Platinum plans unlock AI messages, larger file sharing, more linked accounts, and advanced features.
- **AfuAI**: Built-in AI chatbot accessible via DMs. Users search for AI-related queries to use it.
- **Chats & Groups**: Private DMs, group chats, and broadcast channels. End-to-end encrypted.
- **Reactions & Stickers**: Users react to messages with emoji. Sticker packs are part of the gifting culture.
- **Hashtags**: Posts and videos are tagged. Trending hashtags surface popular topics.
- **Onboarding**: New users select interests (e.g. Tech, Music, Fashion, Business, Education, Sports, Gaming, Food, Travel, Art).

## YOUR TASK
Given the search query, reason about what the user truly wants on AfuChat, then reply ONLY with valid JSON (no markdown, no code blocks, no extra text) in this exact format:
{
  "summary": "2-3 sentences explaining exactly what the user is looking for, why they might be searching this on AfuChat, and what kind of content or person they expect to find",
  "intent": "one of: person | content | video | topic | product | service | event | job | gift | community | mixed",
  "bestCategory": "one of: people | posts | videos | channels | events | gifts | market | jobs | all",
  "keyTerms": ["2-5 core extracted search keywords most relevant to finding results"],
  "suggestions": ["a more specific version of this search", "a related search the user might also want", "a broader or alternative angle on the same need"],
  "explanation": "one concrete sentence naming the best category and why — e.g. which feature of that category makes it the right fit"
}

## EXAMPLES
Query: "graphic designer Nigeria"
→ intent: "person", bestCategory: "people", summary: "The user is looking for a graphic designer based in Nigeria, likely to hire or collaborate with. On AfuChat, many creative professionals list their country and skills in their bio and offer freelance services. They may also find relevant freelance listings in the Market.", keyTerms: ["graphic design", "designer", "Nigeria", "creative"], suggestions: ["freelance graphic designer Lagos", "logo designer Nigeria", "creative designer portfolio"], explanation: "People is best because designers with country=Nigeria will appear there; the Market tab also has freelance design services."

Query: "afuai how to use"
→ intent: "topic", bestCategory: "posts", summary: "The user wants to learn how to use AfuAI, the built-in AI chatbot on AfuChat. They are likely a new user exploring the platform's AI features. Posts and videos from the community explaining AfuAI usage will be most helpful.", keyTerms: ["AfuAI", "AI chatbot", "how to use", "AfuChat AI"], suggestions: ["AfuAI tips", "AfuChat AI features", "how to chat with AI on AfuChat"], explanation: "Posts and videos contain tutorials and community explanations about AfuAI; the AI itself is accessible via the chat section."

Query: "coding bootcamp"
→ intent: "event", bestCategory: "events", summary: "The user is searching for a coding bootcamp — a structured, intensive learning programme. AfuChat hosts educational events, workshops, and training sessions in its Events section, often around tech and education. Channels run by tech communities and posts about bootcamp opportunities are also relevant.", keyTerms: ["coding", "bootcamp", "programming", "tech training"], suggestions: ["software development workshop", "tech event Lagos", "web development course"], explanation: "Events is the best category as bootcamps are time-bound structured programmes typically listed there."`,
          },
          { role: "user", content: `Search query: "${query}"` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? data?.content ?? data?.reply ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      summary: parsed.summary || "",
      intent: parsed.intent || "mixed",
      bestCategory: parsed.bestCategory || "all",
      keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      explanation: parsed.explanation || "",
    } as AiInsight;
  } catch {
    return null;
  }
}

// ─── Video Thumbnail Cache ────────────────────────────────────────────────────
const thumbCache = new Map<string, string>();

function VideoThumbnailImage({ videoUrl, imageUrl, style }: { videoUrl: string; imageUrl: string | null; style: any }) {
  const [thumbUri, setThumbUri] = useState<string | null>(imageUrl || null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (thumbUri || tried) return;
    setTried(true);
    if (thumbCache.has(videoUrl)) {
      setThumbUri(thumbCache.get(videoUrl)!);
      return;
    }
    VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1500 })
      .then(({ uri }) => {
        thumbCache.set(videoUrl, uri);
        setThumbUri(uri);
      })
      .catch(() => {});
  }, [videoUrl]);

  if (thumbUri) {
    return <Image source={{ uri: thumbUri }} style={style} resizeMode="cover" />;
  }
  return null;
}

// ─── Avatar Placeholder ───────────────────────────────────────────────────────

function AvatarPlaceholder({ name, size, color }: { name: string; size: number; color: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: color + "22" }}>
      <Text style={{ color, fontSize: size * 0.4, fontFamily: "Inter_700Bold" }}>{(name || "?")[0].toUpperCase()}</Text>
    </View>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function RowSkeleton({ bg }: { bg: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: bg, opacity: 0.5 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ width: "60%", height: 13, borderRadius: 6, backgroundColor: bg, opacity: 0.5 }} />
        <View style={{ width: "40%", height: 11, borderRadius: 6, backgroundColor: bg, opacity: 0.4 }} />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const { tag: incomingTag, q: incomingQ } = useLocalSearchParams<{ tag?: string; q?: string }>();
  const handledTagRef = useRef<string | null>(null);
  const handledQRef   = useRef<string | null>(null);
  const { isDesktop } = useIsDesktop();

  const scrollPB = insets.bottom + 90;

  const inputRef    = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchIdRef = useRef(0);

  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<SearchTab>("all");
  const [sortMode,     setSortMode]     = useState<SortMode>("relevance");
  const [dateRange,    setDateRange]    = useState<DateRange>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [aiMode,       setAiMode]       = useState(false);

  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState<AllResults>(EMPTY);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalCount,  setTotalCount]  = useState(0);

  const [history,     setHistory]     = useState<string[]>([]);
  const [saved,       setSaved]       = useState<SavedSearch[]>([]);

  const [trendingPeople,   setTrendingPeople]   = useState<PersonResult[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [trendingVideos,   setTrendingVideos]   = useState<VideoResult[]>([]);

  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (incomingTag && incomingTag !== handledTagRef.current) {
      handledTagRef.current = incomingTag;
      const q = `#${incomingTag}`;
      setQuery(q);
      performSearch(q, "posts", verifiedOnly, sortMode, dateRange);
    }
  }, [incomingTag]);

  useEffect(() => {
    if (incomingQ && incomingQ !== handledQRef.current) {
      handledQRef.current = incomingQ;
      setQuery(incomingQ);
      performSearch(incomingQ, tab, verifiedOnly, sortMode, dateRange);
    }
  }, [incomingQ]);

  useEffect(() => {
    loadInitial();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function loadInitial() {
    const [h, s] = await Promise.all([getSearchHistory(), getSavedSearches()]);
    setHistory(h); setSaved(s);
    loadTrendingPeople();
    loadTrendingHashtags();
    loadTrendingVideos();
  }

  async function loadTrendingPeople() {
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
      .eq("is_verified", true)
      .order("xp", { ascending: false })
      .limit(12);
    if (data) setTrendingPeople(data.map((p: any) => ({ ...p, kind: "profile" })));
  }

  async function loadTrendingHashtags() {
    try {
      const { data } = await supabase.from("posts")
        .select("content, view_count")
        .ilike("content", "%#%")
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!data) return;
      const RE = /#(\w{2,30})/g;
      const scores: Record<string, number> = {};
      for (const p of data) {
        if (!p.content) continue;
        RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = RE.exec(p.content))) {
          const t = m[1].toLowerCase();
          scores[t] = (scores[t] || 0) + 1 + Math.log1p(p.view_count || 0) * 0.15;
        }
      }
      setTrendingHashtags(
        Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag, score]) => ({ tag, count: Math.max(1, Math.round(score)) }))
      );
    } catch {}
  }

  async function loadTrendingVideos() {
    try {
      const { data } = await supabase
        .from("posts")
        .select("id, content, video_url, image_url, author_id, view_count, created_at, audio_name")
        .eq("post_type", "video")
        .eq("visibility", "public")
        .not("video_url", "is", null)
        .order("view_count", { ascending: false })
        .limit(8);
      if (!data || data.length === 0) return;
      const ids = [...new Set(data.map((v: any) => v.author_id))] as string[];
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
      const pm = new Map((profiles || []).map((p: any) => [p.id, p]));
      setTrendingVideos(data.map((v: any) => {
        const a = pm.get(v.author_id) || {} as any;
        return {
          id: v.id, content: v.content || "", video_url: v.video_url,
          image_url: v.image_url || null, author_id: v.author_id,
          author_handle: a.handle || "", author_name: a.display_name || "",
          author_avatar: a.avatar_url || null, view_count: v.view_count || 0,
          created_at: v.created_at, audio_name: v.audio_name || null, duration_seconds: null,
        };
      }));
    } catch {}
  }

  // ── Main search ─────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (
    q: string, currentTab: SearchTab, vOnly: boolean, sort: SortMode, dr: DateRange,
  ) => {
    const trimmed = q.trim();
    if (trimmed.length < 1 && currentTab !== "videos" && currentTab !== "jobs") {
      setResults(EMPTY); setHasSearched(false); setTotalCount(0); return;
    }

    const id = ++searchIdRef.current;
    setLoading(true); setHasSearched(true); setAiInsight(null);
    const pat = `%${trimmed}%`;
    const all = currentTab === "all";
    const cutoff = dateRangeCutoff(dr);

    try {
      if (aiMode && trimmed.length >= 3) {
        setAiLoading(true);
        fetchAiInsight(trimmed)
          .then((insight) => { if (insight && id === searchIdRef.current) setAiInsight(insight); })
          .finally(() => setAiLoading(false));
      }

      const wantsPeople   = all || currentTab === "people";
      const wantsPosts    = all || currentTab === "posts";
      const wantsVideos   = all || currentTab === "videos";
      const wantsChannels = all || currentTab === "channels";
      const wantsEvents   = all || currentTab === "events";
      const wantsGifts    = all || currentTab === "gifts";
      const wantsMarket   = all || currentTab === "market";
      const wantsJobs     = all || currentTab === "jobs";

      const [peopleRes, orgPageRes, postsRes, videosRes, channelsRes, groupsRes, eventsRes, giftsRes, jobsRes] =
        await Promise.all([
          wantsPeople
            ? (() => {
                let pq = supabase.from("profiles")
                  .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
                  .or(`handle.ilike.${pat},display_name.ilike.${pat},bio.ilike.${pat}`);
                if (vOnly) pq = pq.eq("is_verified", true);
                pq = pq.order("xp", { ascending: false });
                return pq.limit(all ? 5 : 25);
              })()
            : Promise.resolve({ data: [] }),

          wantsPeople
            ? supabase.from("organization_pages")
                .select("id, name, slug, logo_url, description")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .limit(all ? 3 : 10)
            : Promise.resolve({ data: [] }),

          wantsPosts
            ? (() => {
                let pq = supabase.from("posts")
                  .select("id, content, image_url, author_id, view_count, created_at, post_type, article_title")
                  .ilike("content", pat)
                  .eq("visibility", "public")
                  .neq("post_type", "video");
                if (cutoff) pq = pq.gte("created_at", cutoff);
                pq = sort === "popular" ? pq.order("view_count", { ascending: false }) : pq.order("created_at", { ascending: false });
                return pq.limit(all ? 5 : 30);
              })()
            : Promise.resolve({ data: [] }),

          wantsVideos
            ? (() => {
                let vq = supabase.from("posts")
                  .select("id, content, video_url, image_url, author_id, view_count, created_at, audio_name, video_assets(duration_seconds)")
                  .eq("post_type", "video")
                  .eq("visibility", "public")
                  .not("video_url", "is", null);
                if (trimmed.length > 0) vq = vq.ilike("content", pat);
                if (cutoff) vq = vq.gte("created_at", cutoff);
                vq = sort === "recent" ? vq.order("created_at", { ascending: false }) : vq.order("view_count", { ascending: false });
                return vq.limit(all ? 4 : 30);
              })()
            : Promise.resolve({ data: [] }),

          wantsChannels
            ? supabase.from("channels")
                .select("id, name, description, avatar_url, subscriber_count")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .order("subscriber_count", { ascending: false })
                .limit(all ? 4 : 20)
            : Promise.resolve({ data: [] }),

          wantsChannels && trimmed.length >= 1
            ? supabase.from("chats")
                .select("id, name, description, avatar_url, chat_members(count)")
                .eq("is_group", true)
                .eq("is_public", true)
                .ilike("name", pat)
                .limit(all ? 4 : 20)
            : Promise.resolve({ data: [] }),

          wantsEvents
            ? supabase.from("digital_events")
                .select("id, title, description, emoji, price, event_date, capacity, tickets_sold, creator_id, category, profiles!digital_events_creator_id_fkey(display_name, handle)")
                .or(`title.ilike.${pat},description.ilike.${pat}`)
                .gte("event_date", new Date().toISOString())
                .order("event_date", { ascending: true })
                .limit(all ? 3 : 20)
            : Promise.resolve({ data: [] }),

          wantsGifts
            ? supabase.from("gifts")
                .select("id, name, emoji, base_xp_cost, rarity, description")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .order("base_xp_cost", { ascending: true })
                .limit(all ? 6 : 30)
            : Promise.resolve({ data: [] }),

          wantsJobs
            ? supabase.from("org_page_jobs")
                .select("id, title, job_type, location, description, apply_url, created_at, organization_pages!org_page_jobs_page_id_fkey(name, logo_url, slug)")
                .eq("is_active", true)
                .or(trimmed.length > 0 ? `title.ilike.${pat},description.ilike.${pat}` : "id.neq.00000000-0000-0000-0000-000000000000")
                .order("created_at", { ascending: false })
                .limit(all ? 4 : 25)
            : Promise.resolve({ data: [] }),
        ]);

      let marketItems: MarketResult[] = [];
      if (wantsMarket && trimmed.length > 0) {
        const [prods, frees, comms] = await Promise.all([
          supabase.from("shop_products").select("id, name, description, images, price_acoin, seller_id").ilike("name", pat).eq("is_available", true).limit(all ? 3 : 15),
          supabase.from("freelance_listings").select("id, title, description, price, emoji, seller_id, profiles!freelance_listings_seller_id_fkey(display_name, handle)").or(`title.ilike.${pat},description.ilike.${pat}`).eq("is_active", true).limit(all ? 3 : 15),
          supabase.from("paid_communities").select("id, name, description, emoji, price, creator_id, profiles!paid_communities_creator_id_fkey(display_name, handle)").or(`name.ilike.${pat},description.ilike.${pat}`).limit(all ? 2 : 10),
        ]);
        if (prods.data) marketItems.push(...prods.data.map((p: any) => ({
          id: p.id, kind: "product" as const, title: p.name, desc: p.description,
          emoji: null, image_url: (p.images?.[0] || null), price: p.price_acoin || 0,
          badge: "Shop", seller_name: "", route: `/shop/product/${p.id}`,
        })));
        if (frees.data) marketItems.push(...frees.data.map((p: any) => ({
          id: p.id, kind: "freelance" as const, title: p.title, desc: p.description,
          emoji: p.emoji || "💼", image_url: null, price: p.price || 0,
          badge: "Freelance", seller_name: (p.profiles as any)?.display_name || "",
          route: `/freelance`,
        })));
        if (comms.data) marketItems.push(...comms.data.map((p: any) => ({
          id: p.id, kind: "community" as const, title: p.name, desc: p.description,
          emoji: p.emoji || "🏠", image_url: null, price: p.price || 0,
          badge: "Community", seller_name: (p.profiles as any)?.display_name || "",
          route: `/paid-communities`,
        })));
      }

      if (id !== searchIdRef.current) return;

      const profiles2Map = new Map<string, any>();
      const needsProfiles: string[] = [];
      if (postsRes.data) needsProfiles.push(...(postsRes.data as any[]).map((p: any) => p.author_id));
      if (videosRes.data) needsProfiles.push(...(videosRes.data as any[]).map((v: any) => v.author_id));
      if (needsProfiles.length > 0) {
        const uids = [...new Set(needsProfiles)];
        const { data: ps } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", uids);
        if (ps) ps.forEach((p: any) => profiles2Map.set(p.id, p));
      }

      const people: (PersonResult | OrgPageResult)[] = [
        ...((peopleRes.data || []) as any[]).map((p: any) => ({ ...p, kind: "profile" as const })),
        ...((orgPageRes.data || []) as any[]).map((o: any) => ({ ...o, kind: "org" as const })),
      ];

      const posts: PostResult[] = ((postsRes.data || []) as any[]).map((p: any) => {
        const a = profiles2Map.get(p.author_id) || {};
        return { ...p, author_handle: a.handle || "", author_name: a.display_name || "", author_avatar: a.avatar_url || null };
      });

      const videos: VideoResult[] = ((videosRes.data || []) as any[]).map((v: any) => {
        const a = profiles2Map.get(v.author_id) || {};
        const dur = (v.video_assets as any[] | null)?.[0]?.duration_seconds ?? null;
        return {
          id: v.id, content: v.content || "", video_url: v.video_url, image_url: v.image_url || null,
          author_id: v.author_id, author_handle: a.handle || "", author_name: a.display_name || "",
          author_avatar: a.avatar_url || null, view_count: v.view_count || 0, created_at: v.created_at,
          audio_name: v.audio_name || null, duration_seconds: dur,
        };
      });

      const channels: ChannelResult[] = (channelsRes.data || []) as any[];

      const groups: GroupResult[] = ((groupsRes.data || []) as any[]).map((c: any) => {
        const countArr = c.chat_members;
        const member_count = Array.isArray(countArr) && countArr[0]?.count != null ? Number(countArr[0].count) : 0;
        return { id: c.id, name: c.name || "Unnamed", description: c.description || null, avatar_url: c.avatar_url || null, member_count };
      });

      const events: EventResult[] = ((eventsRes.data || []) as any[]).map((e: any) => {
        const cr = (e.profiles as any) || {};
        return {
          id: e.id, title: e.title, description: e.description, emoji: e.emoji || "🎟️",
          price: e.price || 0, event_date: e.event_date, capacity: e.capacity || 0,
          tickets_sold: e.tickets_sold || 0, category: e.category || null,
          creator_name: cr.display_name || "", creator_handle: cr.handle || "",
        };
      });

      const gifts: GiftResult[] = (giftsRes.data || []) as any[];

      const jobs: JobResult[] = ((jobsRes.data || []) as any[]).map((j: any) => {
        const op = (j.organization_pages as any) || {};
        return {
          id: j.id, title: j.title, job_type: j.job_type || null, location: j.location || null,
          description: j.description || null, apply_url: j.apply_url || null, created_at: j.created_at,
          company_name: op.name || "Company", company_logo: op.logo_url || null, company_slug: op.slug || null,
        };
      });

      const finalResults: AllResults = { people, posts, videos, channels, groups, events, gifts, market: marketItems, jobs };
      if (id !== searchIdRef.current) return;

      setResults(finalResults);
      const total = people.length + posts.length + videos.length + channels.length + groups.length
        + events.length + gifts.length + marketItems.length + jobs.length;
      setTotalCount(total);
      setLoading(false);
      if (trimmed.length > 0) addToHistory(trimmed).then(setHistory);
    } catch {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, [aiMode]);

  // ── Event handlers ───────────────────────────────────────────────────────────

  function onChangeText(t: string) {
    setQuery(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (t.trim().length === 0) {
      setResults(EMPTY); setHasSearched(false); setTotalCount(0); return;
    }
    debounceRef.current = setTimeout(() => {
      performSearch(t, tab, verifiedOnly, sortMode, dateRange);
    }, 520);
  }

  function onSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    performSearch(query, tab, verifiedOnly, sortMode, dateRange);
    inputRef.current?.blur();
  }

  function clearSearch() {
    setQuery(""); setResults(EMPTY); setHasSearched(false);
    setTotalCount(0);
    inputRef.current?.focus();
  }

  function onHistoryPress(term: string) {
    setQuery(term);
    performSearch(term, tab, verifiedOnly, sortMode, dateRange);
    inputRef.current?.blur();
  }

  function onTagPress(tag: string) {
    const q = `#${tag}`;
    setQuery(q); setTab("posts");
    performSearch(q, "posts", verifiedOnly, sortMode, dateRange);
    inputRef.current?.blur();
  }

  function onTabPress(t: SearchTab) {
    Haptics.selectionAsync();
    setTab(t);
    if (hasSearched) performSearch(query, t, verifiedOnly, sortMode, dateRange);
    else if (t === "videos" || t === "jobs") performSearch("", t, verifiedOnly, "popular", "all");
  }

  function toggleAiMode() {
    Haptics.selectionAsync();
    const next = !aiMode;
    setAiMode(next);
    if (next && hasSearched && query.trim().length >= 3) {
      setAiLoading(true);
      fetchAiInsight(query.trim())
        .then((i) => { if (i) setAiInsight(i); })
        .finally(() => setAiLoading(false));
    }
  }

  function onSortPress(s: SortMode) {
    setSortMode(s);
    if (hasSearched) performSearch(query, tab, verifiedOnly, s, dateRange);
  }

  function onDatePress(dr: DateRange) {
    setDateRange(dr);
    if (hasSearched) performSearch(query, tab, verifiedOnly, sortMode, dr);
  }

  // ─── Section header ──────────────────────────────────────────────────────────

  function SectionHeader({ icon, label, color, count, onSeeAll }: {
    icon: string; label: string; color: string; count: number; onSeeAll?: () => void;
  }) {
    if (count === 0) return null;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 22, paddingBottom: 8, gap: 8 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + "1A", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon as any} size={14} color={color} />
        </View>
        <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: 0.1 }}>{label}</Text>
        <View style={{ backgroundColor: color + "1A", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color, fontSize: 11, fontFamily: "Inter_700Bold" }}>{count}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 2 }}>
            <Text style={{ color, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>See all</Text>
            <Ionicons name="chevron-forward" size={12} color={color} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ─── PersonCard ──────────────────────────────────────────────────────────────

  function PersonCard({ p, i }: { p: PersonResult | OrgPageResult; i: number }) {
    if (p.kind === "org") {
      const o = p as OrgPageResult;
      return (
        <Animated.View entering={FadeInDown.delay(i * 30).duration(200)}>
          <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(`/company/${o.slug}` as any)} activeOpacity={0.75}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: GOLD + "1A", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {o.logo_url ? <Image source={{ uri: o.logo_url }} style={{ width: 48, height: 48, borderRadius: 12 }} /> : <Ionicons name="business" size={22} color={GOLD} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{o.name}</Text>
                <View style={{ backgroundColor: GOLD + "22", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ color: GOLD, fontSize: 9, fontFamily: "Inter_700Bold" }}>ORG</Text>
                </View>
              </View>
              {o.description ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{o.description}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      );
    }
    const per = p as PersonResult;
    return (
      <Animated.View entering={FadeInDown.delay(i * 30).duration(200)}>
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push({ pathname: "/contact/[id]", params: { id: per.id, init_name: per.display_name, init_handle: per.handle, init_avatar: per.avatar_url ?? "", init_verified: per.is_verified ? "1" : "0", init_org_verified: per.is_organization_verified ? "1" : "0" } } as any)} activeOpacity={0.75}>
          <View style={{ position: "relative" }}>
            {per.avatar_url
              ? <Image source={{ uri: per.avatar_url }} style={{ width: 48, height: 48, borderRadius: per.is_organization_verified ? 12 : 24 }} />
              : <AvatarPlaceholder name={per.display_name} size={48} color={BRAND} />}
            {per.is_verified && (
              <View style={[ss.verifyBadge, { backgroundColor: colors.background }]}>
                <Ionicons name="checkmark-circle" size={14} color={per.is_organization_verified ? GOLD : BRAND} />
              </View>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{per.display_name}</Text>
            <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>@{per.handle}{per.country ? ` · ${per.country}` : ""}</Text>
            {per.bio ? <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>{per.bio}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── PostCard ────────────────────────────────────────────────────────────────

  function PostCard({ p, i }: { p: PostResult; i: number }) {
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(200)}>
        <TouchableOpacity style={[ss.contentCard, { backgroundColor: colors.surface }]} onPress={() => router.push(`/post/${p.id}` as any)} activeOpacity={0.75}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {p.author_avatar
              ? <Image source={{ uri: p.author_avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} />
              : <AvatarPlaceholder name={p.author_name} size={28} color={BRAND} />}
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 }}>@{p.author_handle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(p.created_at)}</Text>
          </View>
          {p.article_title && <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 5 }} numberOfLines={2}>{p.article_title}</Text>}
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }} numberOfLines={3}>{p.content}</Text>
          {p.image_url && <Image source={{ uri: p.image_url }} style={ss.postImage} resizeMode="cover" />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmtNum(p.view_count)}</Text>
            </View>
            {p.post_type === "article" && (
              <View style={{ backgroundColor: PURPLE + "1A", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>ARTICLE</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── Video grid (TikTok 2-col) ───────────────────────────────────────────────

  const VID_W = (SW - 32 - 8) / 2;
  const VID_H = VID_W * 1.5;

  function VideoGrid({ videos }: { videos: VideoResult[] }) {
    const rows: VideoResult[][] = [];
    for (let i = 0; i < videos.length; i += 2) rows.push(videos.slice(i, i + 2));
    return (
      <View style={{ paddingHorizontal: 12, gap: 8 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", gap: 8 }}>
            {row.map((v) => <VideoTile key={v.id} v={v} />)}
          </View>
        ))}
      </View>
    );
  }

  function VideoTile({ v }: { v: VideoResult }) {
    return (
      <TouchableOpacity
        style={{ width: VID_W, height: VID_H, borderRadius: 12, overflow: "hidden", backgroundColor: isDark ? "#1a1a2e" : "#f0f0f0" }}
        onPress={() => router.push(`/video/${v.id}` as any)}
        activeOpacity={0.88}
      >
        {/* Gradient background always present as base layer */}
        <LinearGradient colors={["#1a1a2e", RED + "88"]} style={{ position: "absolute", width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="play-circle" size={36} color="#ffffff44" />
        </LinearGradient>
        {/* Thumbnail: stored image_url or auto-generated from video */}
        <VideoThumbnailImage
          videoUrl={v.video_url}
          imageUrl={v.image_url}
          style={{ position: "absolute", width: "100%", height: "100%" }}
        />
        {/* Duration badge */}
        {v.duration_seconds != null && (
          <View style={{ position: "absolute", bottom: 44, right: 7, backgroundColor: "#000000bb", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>
              {Math.floor(v.duration_seconds / 60)}:{String(Math.floor(v.duration_seconds % 60)).padStart(2, "0")}
            </Text>
          </View>
        )}
        <LinearGradient colors={["transparent", "#00000099"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, paddingBottom: 10 }}>
          <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium", lineHeight: 15 }} numberOfLines={2}>{v.content || v.author_name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Ionicons name="eye-outline" size={10} color="#ffffffaa" />
            <Text style={{ color: "#ffffffaa", fontSize: 10 }}>{fmtNum(v.view_count)}</Text>
            {v.author_name ? (
              <>
                <Text style={{ color: "#ffffff55", fontSize: 10 }}>·</Text>
                <Text style={{ color: "#ffffffaa", fontSize: 10 }} numberOfLines={1}>@{v.author_handle || v.author_name}</Text>
              </>
            ) : null}
          </View>
        </LinearGradient>
        <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: "#00000066", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Ionicons name="play" size={8} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" }}>VIDEO</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ─── GroupCard ────────────────────────────────────────────────────────────────

  function GroupCard({ gr, i }: { gr: GroupResult; i: number }) {
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(200)}>
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(`/group/${gr.id}` as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 48, borderRadius: 14, overflow: "hidden" }}>
            {gr.avatar_url
              ? <Image source={{ uri: gr.avatar_url }} style={{ width: 48, height: 48 }} />
              : <LinearGradient colors={[BRAND, "#0097A7"]} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="people" size={22} color="#fff" /></LinearGradient>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{gr.name}</Text>
            {gr.description ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{gr.description}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="people-outline" size={11} color={BRAND} />
              <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{fmtNum(gr.member_count)} members</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── ChannelCard ─────────────────────────────────────────────────────────────

  function ChannelCard({ ch, i }: { ch: ChannelResult; i: number }) {
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(200)}>
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(`/channel/${ch.id}` as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 48, borderRadius: 14, overflow: "hidden" }}>
            {ch.avatar_url
              ? <Image source={{ uri: ch.avatar_url }} style={{ width: 48, height: 48 }} />
              : <LinearGradient colors={[PURPLE, "#A855F7"]} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="megaphone" size={22} color="#fff" /></LinearGradient>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{ch.name}</Text>
            {ch.description ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{ch.description}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="people-outline" size={11} color={PURPLE} />
              <Text style={{ color: PURPLE, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{fmtNum(ch.subscriber_count)} subscribers</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── EventCard ───────────────────────────────────────────────────────────────

  function EventCard({ ev, i }: { ev: EventResult; i: number }) {
    const d = new Date(ev.event_date);
    const sold = ev.capacity > 0 ? Math.round((ev.tickets_sold / ev.capacity) * 100) : 0;
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(200)}>
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push("/digital-events" as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 52, borderRadius: 12, backgroundColor: WARN + "1A", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: WARN, fontSize: 9, fontFamily: "Inter_700Bold" }}>{d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</Text>
            <Text style={{ color: WARN, fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 24 }}>{d.getDate()}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{ev.emoji} {ev.title}</Text>
            <Text style={[ss.rowSub, { color: colors.textMuted }]}>by @{ev.creator_handle}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: ev.price === 0 ? SUCCESS + "1A" : WARN + "1A", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ color: ev.price === 0 ? SUCCESS : WARN, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{ev.price === 0 ? "Free" : `${ev.price} AC`}</Text>
              </View>
              {sold > 0 && <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sold}% sold</Text>}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── GiftGrid ────────────────────────────────────────────────────────────────

  const GIFT_W = Math.floor((SW - 32 - 10 * 3) / 4);

  function GiftGrid({ gifts }: { gifts: GiftResult[] }) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 }}>
        {gifts.map((g, i) => {
          const rc = RARITY_COLORS[g.rarity] || "#9E9E9E";
          return (
            <Animated.View key={g.id} entering={FadeInDown.delay(i * 20).duration(180)}>
              <TouchableOpacity onPress={() => router.push("/gifts/marketplace" as any)} activeOpacity={0.8} style={{ width: GIFT_W, backgroundColor: colors.surface, borderRadius: 14, padding: 10, alignItems: "center", gap: 4, borderWidth: 1, borderColor: rc + "30" }}>
                <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center" }} numberOfLines={2}>{g.name}</Text>
                <View style={{ backgroundColor: rc + "1A", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: rc, fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{g.rarity}</Text>
                </View>
                <Text style={{ color: GOLD, fontSize: 11, fontFamily: "Inter_700Bold" }}>✦ {g.base_xp_cost}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  }

  // ─── MarketCard ──────────────────────────────────────────────────────────────

  function MarketCard({ s, i }: { s: MarketResult; i: number }) {
    const c = s.kind === "product" ? BRAND : s.kind === "freelance" ? PURPLE : SUCCESS;
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(200)}>
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(s.route as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden", backgroundColor: c + "1A", alignItems: "center", justifyContent: "center" }}>
            {s.image_url
              ? <Image source={{ uri: s.image_url }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              : <Text style={{ fontSize: 22 }}>{s.emoji || "🛍️"}</Text>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{s.title}</Text>
            {s.desc ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{s.desc}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ backgroundColor: c + "1A", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 }}>
                <Text style={{ color: c, fontSize: 10, fontFamily: "Inter_700Bold" }}>{s.badge}</Text>
              </View>
              {s.price > 0 && <Text style={{ color: GOLD, fontSize: 12, fontFamily: "Inter_700Bold" }}>⬡ {s.price} AC</Text>}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── JobCard ─────────────────────────────────────────────────────────────────

  function JobCard({ j, i }: { j: JobResult; i: number }) {
    const tc = j.job_type?.toLowerCase().includes("remote") ? SUCCESS
      : j.job_type?.toLowerCase().includes("full") ? "#007AFF"
      : j.job_type?.toLowerCase().includes("part") ? WARN : BRAND;
    return (
      <Animated.View entering={FadeInDown.delay(i * 25).duration(220)}>
        <TouchableOpacity
          style={[ss.contentCard, { backgroundColor: colors.surface }]}
          onPress={() => {
            Haptics.selectionAsync();
            if (j.apply_url) Linking.openURL(j.apply_url).catch(() => {});
            else if (j.company_slug) router.push(`/company/${j.company_slug}` as any);
          }}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {j.company_logo
              ? <Image source={{ uri: j.company_logo }} style={{ width: 44, height: 44, borderRadius: 12 }} />
              : <LinearGradient colors={[SUCCESS, "#30D158"]} style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Ionicons name="business" size={20} color="#fff" /></LinearGradient>}
            <View style={{ flex: 1 }}>
              <Text style={[ss.rowTitle, { color: colors.text, marginBottom: 2 }]} numberOfLines={2}>{j.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 7 }}>{j.company_name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {j.job_type && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: tc + "1A", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                    <Ionicons name="briefcase-outline" size={10} color={tc} />
                    <Text style={{ color: tc, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{j.job_type}</Text>
                  </View>
                )}
                {j.location && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                    <Ionicons name="location-outline" size={10} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{j.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                  <Ionicons name="time-outline" size={10} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(j.created_at)}</Text>
                </View>
              </View>
            </View>
            <View style={{ backgroundColor: SUCCESS, width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="open-outline" size={14} color="#fff" />
            </View>
          </View>
          {j.description ? <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 }} numberOfLines={2}>{j.description}</Text> : null}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ─── AI Insight card ─────────────────────────────────────────────────────────

  const INTENT_ICONS: Record<string, string> = {
    person: "person-outline", content: "document-text-outline", video: "videocam-outline",
    topic: "pricetag-outline", product: "bag-outline", event: "calendar-outline",
    job: "briefcase-outline", mixed: "search-outline",
  };
  const CAT_LABELS: Record<string, string> = {
    people: "People", posts: "Posts", videos: "Videos", channels: "Channels",
    events: "Events", gifts: "Gifts", market: "Market", jobs: "Jobs", all: "All",
  };

  function AiCard() {
    if (aiLoading) {
      return (
        <View style={[ss.aiCard, { borderColor: PURPLE + "30", backgroundColor: PURPLE + "0A" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator size="small" color={PURPLE} />
            <Text style={{ color: PURPLE, fontSize: 13, fontFamily: "Inter_500Medium" }}>AI is analyzing your search…</Text>
          </View>
        </View>
      );
    }
    if (!aiInsight) return null;

    const intentIcon = (INTENT_ICONS[aiInsight.intent] || "search-outline") as any;
    const catLabel   = CAT_LABELS[aiInsight.bestCategory] || aiInsight.bestCategory;

    return (
      <Animated.View entering={FadeInDown.duration(280)}>
        <LinearGradient
          colors={isDark ? [PURPLE + "28", PURPLE + "0C"] : [PURPLE + "16", PURPLE + "06"]}
          style={[ss.aiCard, { borderColor: PURPLE + "35" }]}
        >
          {/* Header row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <LinearGradient colors={[PURPLE, "#A855F7"]} style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={15} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ color: PURPLE, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.9 }}>AI SEARCH INSIGHT</Text>
            </View>
            {/* Intent + best category badges */}
            <View style={{ flexDirection: "row", gap: 5 }}>
              <View style={{ backgroundColor: PURPLE + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name={intentIcon} size={10} color={PURPLE} />
                <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{aiInsight.intent}</Text>
              </View>
            </View>
          </View>

          {/* Summary */}
          <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 10 }}>{aiInsight.summary}</Text>

          {/* Best category recommendation */}
          {aiInsight.explanation ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: PURPLE + "12", borderRadius: 8, padding: 8, marginBottom: 10 }}>
              <Ionicons name="bulb-outline" size={13} color={PURPLE} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "Inter_700Bold", marginBottom: 2 }}>
                  Best results in: <Text style={{ color: colors.text }}>{catLabel}</Text>
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16 }}>{aiInsight.explanation}</Text>
              </View>
            </View>
          ) : null}

          {/* Key terms */}
          {aiInsight.keyTerms.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {aiInsight.keyTerms.map((term, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ backgroundColor: isDark ? "#ffffff14" : "#00000010", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}
                  onPress={() => onHistoryPress(term)}
                >
                  <Ionicons name="key-outline" size={9} color={colors.textMuted} />
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium" }}>{term}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Suggestions */}
          {aiInsight.suggestions.length > 0 && (
            <>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 6 }}>TRY THESE SEARCHES</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {aiInsight.suggestions.map((s, i) => (
                  <TouchableOpacity key={i} style={{ backgroundColor: PURPLE + "1A", borderColor: PURPLE + "30", borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => onHistoryPress(s)}>
                    <Ionicons name="search-outline" size={10} color={PURPLE} />
                    <Text style={{ color: PURPLE, fontSize: 12, fontFamily: "Inter_500Medium" }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </LinearGradient>
      </Animated.View>
    );
  }

  // ─── No Results (AI-powered overlay) ─────────────────────────────────────────

  function NoResults() {
    const tags = trendingHashtags.length > 0
      ? trendingHashtags.slice(0, 8)
      : FALLBACK_TAGS.slice(0, 8).map(t => ({ tag: t, count: 0 }));
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: scrollPB + 16 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: "center", paddingTop: 36, paddingHorizontal: 24 }}>
          {/* Icon cluster */}
          <View style={{ marginBottom: 20, alignItems: "center", justifyContent: "center" }}>
            <LinearGradient colors={[BRAND + "30", BRAND + "08"]} style={{ width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" }}>
              <LinearGradient colors={[BRAND + "60", BRAND + "25"]} style={{ width: 75, height: 75, borderRadius: 38, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="search-outline" size={36} color={BRAND} />
              </LinearGradient>
            </LinearGradient>
          </View>
          <Text style={{ fontSize: 21, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center", marginBottom: 8 }}>
            No results found
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", lineHeight: 21, marginBottom: 24 }}>
            Nothing matched{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.text }}>"{query.trim()}"</Text>
            {"\n"}Try different keywords or explore below.
          </Text>

          {(aiInsight || aiLoading) && (
            <View style={{ width: "100%", marginBottom: 16 }}>
              <AiCard />
            </View>
          )}

          {/* Trending alternatives */}
          <View style={{ width: "100%", backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Ionicons name="flame" size={14} color={RED} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text }}>Trending on AfuChat</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {tags.map(({ tag }) => (
                <TouchableOpacity key={tag} style={{ backgroundColor: BRAND + "12", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: BRAND + "25" }} onPress={() => onTagPress(tag)} activeOpacity={0.7}>
                  <Text style={{ color: BRAND, fontSize: 13, fontFamily: "Inter_500Medium" }}>#{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {!aiMode && (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: PURPLE + "10", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: PURPLE + "25", width: "100%" }} onPress={toggleAiMode} activeOpacity={0.85}>
              <LinearGradient colors={[PURPLE, "#A855F7"]} style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ color: PURPLE, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Try AI-powered search</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Get smart suggestions for your query</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={PURPLE} />
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    );
  }

  // ─── Results view ────────────────────────────────────────────────────────────

  function renderResults() {
    const showPeople   = (tab === "all" || tab === "people")   && results.people.length > 0;
    const showPosts    = (tab === "all" || tab === "posts")    && results.posts.length > 0;
    const showVideos   = (tab === "all" || tab === "videos")   && results.videos.length > 0;
    const showChannels = (tab === "all" || tab === "channels") && results.channels.length > 0;
    const showEvents   = (tab === "all" || tab === "events")   && results.events.length > 0;
    const showGifts    = (tab === "all" || tab === "gifts")    && results.gifts.length > 0;
    const showMarket   = (tab === "all" || tab === "market")   && results.market.length > 0;
    const showJobs     = (tab === "all" || tab === "jobs")     && results.jobs.length > 0;
    const any = showPeople || showPosts || showVideos || showChannels || showEvents || showGifts || showMarket || showJobs;

    if (!any) return <NoResults />;

    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: scrollPB }}>
        {/* Results summary */}
        <Animated.View entering={FadeIn.duration(200)} style={[ss.resultsBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="search" size={13} color={BRAND} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.text }}>{totalCount}</Text>{" "}results for{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: BRAND }}>"{query.trim()}"</Text>
            </Text>
          </View>
          {aiMode && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PURPLE + "18", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Ionicons name="sparkles" size={11} color={PURPLE} />
              <Text style={{ color: PURPLE, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>AI</Text>
            </View>
          )}
        </Animated.View>

        {aiMode && (aiInsight || aiLoading) && (
          <View style={{ paddingHorizontal: 14, paddingTop: 14 }}><AiCard /></View>
        )}

        {showPeople && (
          <View>
            <SectionHeader icon="people" label="People & Organizations" color={BRAND} count={results.people.length} onSeeAll={tab === "all" && results.people.length >= 5 ? () => onTabPress("people") : undefined} />
            {results.people.map((p, i) => <PersonCard key={`${(p as any).kind}-${p.id}`} p={p} i={i} />)}
          </View>
        )}
        {showPosts && (
          <View>
            <SectionHeader icon="document-text" label="Posts & Articles" color="#007AFF" count={results.posts.length} onSeeAll={tab === "all" && results.posts.length >= 5 ? () => onTabPress("posts") : undefined} />
            <View style={{ paddingHorizontal: 12, gap: 10 }}>
              {results.posts.map((p, i) => <PostCard key={p.id} p={p} i={i} />)}
            </View>
          </View>
        )}
        {showVideos && (
          <View>
            <SectionHeader icon="play-circle" label="Videos" color={RED} count={results.videos.length} onSeeAll={tab === "all" && results.videos.length >= 4 ? () => onTabPress("videos") : undefined} />
            <VideoGrid videos={tab === "all" ? results.videos.slice(0, 4) : results.videos} />
          </View>
        )}
        {showJobs && (
          <View>
            <SectionHeader icon="briefcase" label="Jobs & Opportunities" color={SUCCESS} count={results.jobs.length} onSeeAll={tab === "all" && results.jobs.length >= 4 ? () => onTabPress("jobs") : undefined} />
            <View style={{ paddingHorizontal: 12, gap: 10 }}>
              {results.jobs.map((j, i) => <JobCard key={j.id} j={j} i={i} />)}
            </View>
          </View>
        )}
        {showChannels && (
          <View>
            <SectionHeader icon="megaphone" label="Channels" color={PURPLE} count={results.channels.length} onSeeAll={tab === "all" && results.channels.length >= 4 ? () => onTabPress("channels") : undefined} />
            {results.channels.map((ch, i) => <ChannelCard key={ch.id} ch={ch} i={i} />)}
          </View>
        )}
        {showEvents && (
          <View>
            <SectionHeader icon="calendar" label="Events" color={WARN} count={results.events.length} onSeeAll={tab === "all" && results.events.length >= 3 ? () => onTabPress("events") : undefined} />
            {results.events.map((ev, i) => <EventCard key={ev.id} ev={ev} i={i} />)}
          </View>
        )}
        {showGifts && (
          <View>
            <SectionHeader icon="gift" label="Gifts" color={GOLD} count={results.gifts.length} onSeeAll={tab === "all" && results.gifts.length >= 6 ? () => onTabPress("gifts") : undefined} />
            <GiftGrid gifts={results.gifts} />
          </View>
        )}
        {showMarket && (
          <View>
            <SectionHeader icon="storefront" label="Marketplace" color={INDIGO} count={results.market.length} onSeeAll={tab === "all" && results.market.length >= 5 ? () => onTabPress("market") : undefined} />
            {results.market.map((s, i) => <MarketCard key={`${s.kind}-${s.id}`} s={s} i={i} />)}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── Discovery (idle) view ────────────────────────────────────────────────────

  function renderDiscovery() {
    const tags = trendingHashtags.length > 0 ? trendingHashtags : FALLBACK_TAGS.map(t => ({ tag: t, count: 0 }));
    const catGap = 10;
    const catW = Math.floor((SW - 32 - catGap * 3) / 4);

    return (
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: scrollPB }}>

        {/* Browse categories */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Ionicons name="compass" size={15} color={BRAND} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text }}>Explore AfuChat</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: catGap }}>
            {CATEGORIES.map((cat, i) => (
              <Animated.View key={cat.id} entering={FadeInDown.delay(i * 28).duration(220)}>
                <TouchableOpacity
                  style={{ width: catW, alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 4, backgroundColor: colors.surface, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0.22 : 0.06, shadowRadius: 8, elevation: 3 }}
                  onPress={() => { onTabPress(cat.id as SearchTab); inputRef.current?.focus(); }}
                  activeOpacity={0.78}
                >
                  <LinearGradient colors={cat.gradient} style={{ width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name={cat.icon as any} size={22} color="#fff" />
                  </LinearGradient>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center" }}>{cat.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Trending People */}
        {trendingPeople.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 14, gap: 7 }}>
              <Ionicons name="trending-up" size={15} color={BRAND} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Trending People</Text>
              <TouchableOpacity onPress={() => { onTabPress("people"); inputRef.current?.focus(); }}>
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 4 }}>
              {trendingPeople.map((p, i) => (
                <Animated.View key={p.id} entering={FadeInRight.delay(i * 28).duration(200)}>
                  <TouchableOpacity style={{ alignItems: "center", width: 70, gap: 6 }} onPress={() => router.push({ pathname: "/contact/[id]", params: { id: p.id, init_name: p.display_name, init_handle: p.handle, init_avatar: p.avatar_url ?? "", init_verified: p.is_verified ? "1" : "0", init_org_verified: p.is_organization_verified ? "1" : "0" } } as any)} activeOpacity={0.78}>
                    <View style={{ position: "relative" }}>
                      {p.avatar_url
                        ? <Image source={{ uri: p.avatar_url }} style={{ width: 56, height: 56, borderRadius: p.is_organization_verified ? 14 : 28, borderWidth: 2, borderColor: p.is_organization_verified ? GOLD : BRAND }} />
                        : <LinearGradient colors={[BRAND, "#0097A7"]} style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" }}>{(p.display_name || "?")[0]}</Text></LinearGradient>}
                      {p.is_verified && (
                        <View style={{ position: "absolute", bottom: -2, right: -2 }}>
                          <Ionicons name="checkmark-circle" size={16} color={p.is_organization_verified ? GOLD : BRAND} />
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center" }} numberOfLines={1}>{p.display_name}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: "center" }} numberOfLines={1}>@{p.handle}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending Videos */}
        {trendingVideos.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 14, gap: 7 }}>
              <Ionicons name="flame" size={15} color={RED} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Hot Videos</Text>
              <TouchableOpacity onPress={() => { setTab("videos"); performSearch("", "videos", false, "popular", "all"); }}>
                <Text style={{ color: BRAND, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>See all</Text>
              </TouchableOpacity>
            </View>
            <VideoGrid videos={trendingVideos.slice(0, 6)} />
          </View>
        )}

        {/* Trending Topics */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 13 }}>
            <Ionicons name="pricetag" size={15} color={PURPLE} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text }}>Trending Topics</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tags.map(({ tag, count }, i) => (
              <Animated.View key={tag} entering={FadeIn.delay(i * 15).duration(180)}>
                <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: PURPLE + "10", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: PURPLE + "22" }} onPress={() => onTagPress(tag)} activeOpacity={0.75}>
                  <Text style={{ color: PURPLE, fontSize: 13, fontFamily: "Inter_700Bold" }}>#</Text>
                  <Text style={{ color: PURPLE, fontSize: 13, fontFamily: "Inter_500Medium" }}>{tag}</Text>
                  {count > 1 && <View style={{ backgroundColor: PURPLE + "22", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}><Text style={{ color: PURPLE, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{count > 99 ? "99+" : count}</Text></View>}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Recent searches */}
        {history.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Ionicons name="time-outline" size={15} color={colors.textMuted} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Recent</Text>
              <TouchableOpacity onPress={() => clearHistory().then(() => setHistory([]))}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear all</Text>
              </TouchableOpacity>
            </View>
            {history.slice(0, 6).map((term, i) => (
              <TouchableOpacity key={`h-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }} onPress={() => onHistoryPress(term)} activeOpacity={0.7}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{term}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => removeFromHistory(term).then(setHistory)}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Saved searches */}
        {saved.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 22 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Ionicons name="bookmark" size={15} color={GOLD} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text }}>Saved Searches</Text>
            </View>
            {saved.slice(0, 5).map((s) => (
              <TouchableOpacity key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }} onPress={() => onHistoryPress(s.query)} activeOpacity={0.7}>
                <Ionicons name="bookmark" size={14} color={GOLD} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{s.query}</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => removeSavedSearch(s.id).then(setSaved)}>
                  <Ionicons name="close" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────────

  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>

      {/* Header */}
      <View style={[ss.header, { paddingTop: isDesktop ? 12 : insets.top + 8, backgroundColor: colors.surface + "CC", borderBottomColor: colors.border }]}>

        {/* Title + AI toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: -0.3 }}>Search</Text>
          <TouchableOpacity
            style={[ss.aiToggle, aiMode && { backgroundColor: PURPLE + "18", borderColor: PURPLE + "44" }]}
            onPress={toggleAiMode}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={aiMode ? [PURPLE, "#A855F7"] : ["transparent", "transparent"]}
              style={{ width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="sparkles" size={14} color={aiMode ? "#fff" : colors.textMuted} />
            </LinearGradient>
            <Text style={{ color: aiMode ? PURPLE : colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>AI</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={[ss.searchBar, { backgroundColor: colors.inputBg, borderColor: query.length > 0 ? BRAND + "66" : colors.border }]}>
          <Ionicons name="search" size={17} color={query.length > 0 ? BRAND : colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[ss.searchInput, { color: colors.text }]}
            placeholder="Search people, posts, videos, jobs…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0
            ? <TouchableOpacity onPress={clearSearch} hitSlop={8}><Ionicons name="close-circle" size={17} color={colors.textMuted} /></TouchableOpacity>
            : Platform.OS === "web"
              ? <TouchableOpacity hitSlop={8}><Ionicons name="mic-outline" size={17} color={colors.textMuted} /></TouchableOpacity>
              : null}
        </View>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 6 }}>
          <TouchableOpacity
            style={[ss.filterPill, verifiedOnly && { backgroundColor: BRAND, borderColor: BRAND }]}
            onPress={() => { const nv = !verifiedOnly; setVerifiedOnly(nv); if (hasSearched) performSearch(query, tab, nv, sortMode, dateRange); }}
          >
            <Ionicons name="checkmark-circle" size={12} color={verifiedOnly ? "#fff" : colors.textMuted} />
            <Text style={{ color: verifiedOnly ? "#fff" : colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium" }}>Verified</Text>
          </TouchableOpacity>
          {(["relevance", "recent", "popular"] as SortMode[]).map(s => (
            <TouchableOpacity key={s} style={[ss.filterPill, sortMode === s && { backgroundColor: BRAND + "18", borderColor: BRAND + "44" }]} onPress={() => onSortPress(s)}>
              <Ionicons name={s === "relevance" ? "flash-outline" : s === "recent" ? "time-outline" : "trending-up-outline"} size={12} color={sortMode === s ? BRAND : colors.textMuted} />
              <Text style={{ color: sortMode === s ? BRAND : colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{s}</Text>
            </TouchableOpacity>
          ))}
          {(["all", "24h", "7d", "30d"] as DateRange[]).map(dr => (
            <TouchableOpacity key={dr} style={[ss.filterPill, dateRange === dr && dr !== "all" && { backgroundColor: BRAND + "18", borderColor: BRAND + "44" }]} onPress={() => onDatePress(dr)}>
              <Text style={{ color: dateRange === dr && dr !== "all" ? BRAND : colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium" }}>{dr}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

      </View>

      {/* Tab bar — only shown when results are present */}
      {hasSearched && !loading && (
        <View style={[ss.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingHorizontal: 12 }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              const cnt = t.id === "all" ? totalCount
                : t.id === "people" ? results.people.length
                : t.id === "posts" ? results.posts.length
                : t.id === "videos" ? results.videos.length
                : t.id === "channels" ? results.channels.length
                : t.id === "events" ? results.events.length
                : t.id === "gifts" ? results.gifts.length
                : t.id === "market" ? results.market.length
                : results.jobs.length;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[ss.tabBtn, active && { backgroundColor: BRAND }]}
                  onPress={() => onTabPress(t.id)}
                  activeOpacity={0.78}
                >
                  <Ionicons name={t.icon as any} size={13} color={active ? "#fff" : colors.textMuted} />
                  <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{t.label}</Text>
                  {cnt > 0 && (
                    <View style={{ backgroundColor: active ? "#ffffff33" : BRAND + "18", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ color: active ? "#fff" : BRAND, fontSize: 10, fontFamily: "Inter_700Bold" }}>{cnt > 99 ? "99+" : cnt}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Content area */}
      {loading
        ? <View style={{ flex: 1 }}>
            {[1, 2, 3, 4, 5, 6].map(i => <RowSkeleton key={i} bg={colors.inputBg} />)}
          </View>
        : hasSearched
          ? renderResults()
          : renderDiscovery()}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
    overflow: "visible" as any,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  aiToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 44,
    gap: 9,
    borderWidth: 1.5,
    marginBottom: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },

  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "transparent",
  },

  tabBar: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },

  resultsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  aiCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#00000008",
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowSub: {
    fontSize: 12,
  },

  verifyBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    backgroundColor: "#fff",
    borderRadius: 8,
  },

  contentCard: {
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  postImage: {
    width: "100%" as any,
    height: 160,
    borderRadius: 10,
    marginTop: 10,
  },
});
