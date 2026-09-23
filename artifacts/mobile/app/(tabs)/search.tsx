import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { navigateToProfile } from "@/lib/navigateToProfile";
import * as Haptics from "@/lib/haptics";
import { safeRouter } from "@/lib/navUtils";


import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useOpenLink } from "@/lib/useOpenLink";
import { supabase } from "@/lib/supabase";
import { getEdgeFnBase, edgeHeaders } from "@/lib/aiHelper";
import { getEngagera } from "@/lib/engagera";
import { detectNavIntent, PLATFORM_NAV_MAP, PLATFORM_FEATURES_GUIDE } from "@/lib/platformKnowledge";
import {
  getSearchHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getSavedSearches,
  removeSavedSearch,
  type SavedSearch,
} from "@/lib/searchStore";
import { trackEvent } from "@/lib/activityTracker";
import { formatCompactAmount } from "@/lib/formatCompactAmount";
import { Avatar } from "@/components/ui/Avatar";
import UserName from "@/components/ui/UserName";
import { getPersonalizedTags, getSearchSuggestions } from "@/lib/personalization";
import Colors from "@/constants/colors";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = Colors.brand;
const PURPLE  = "#8B5CF6";
const GOLD    = "#D4A853";
const SUCCESS = "#34C759";
const WARN    = "#FF9500";
const RED     = "#FF3B30";
const INDIGO  = "#5856D6";
const BLUE    = Colors.brand;

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

// CATEGORIES is computed inside SearchScreen so gradients pick up the
// dynamic accent. See the `const CATEGORIES = …` declaration inside the component.

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonResult  = { id:string; handle:string; display_name:string; avatar_url:string|null; bio:string|null; is_verified:boolean; is_organization_verified:boolean; current_grade:string; country:string|null; xp?:number; kind:"profile" };
type OrgPageResult = { id:string; name:string; slug:string; logo_url:string|null; description:string|null; kind:"org" };
type PostResult    = { id:string; content:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; post_type:string; article_title:string|null };
type VideoResult   = { id:string; content:string; video_url:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; audio_name:string|null; duration_seconds:number|null };
type ChannelResult = { id:string; name:string; handle:string|null; description:string|null; avatar_url:string|null; subscriber_count:number; is_subscriber?: boolean };
type GroupResult   = { id:string; name:string; handle:string|null; description:string|null; avatar_url:string|null; member_count:number };
type EventResult   = { id:string; title:string; description:string|null; emoji:string; price:number; event_date:string; capacity:number; tickets_sold:number; category:string|null; creator_name:string; creator_handle:string };
type GiftResult    = { id:string; name:string; emoji:string; base_xp_cost:number; rarity:string; description:string|null };
type MarketResult  = { id:string; kind:"product"|"freelance"|"community"; title:string; desc:string|null; emoji:string|null; image_url:string|null; price:number; badge:string|null; seller_name:string; route:string };
type JobResult     = { id:string; title:string; job_type:string|null; location:string|null; description:string|null; apply_url:string|null; created_at:string; company_name:string; company_logo:string|null; company_slug:string|null };
type AiInsight = { summary:string; suggestions:string[]; intent:string; bestCategory:string; keyTerms:string[]; explanation:string; actions:string[]; navigateTo?:string; navigateLabel?:string; directAnswer?:string };
type LensResult = {
  title: string;
  description: string;
  facts?: string[];
  category?: string;
  confidence?: "high" | "medium" | "low";
  answer?: string;
};

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

/** Robustly extract and parse a JSON object from an AI reply that may include markdown fences or prose. */
function parseAiJson(raw: string): Record<string, any> | null {
  if (!raw) return null;
  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw;
  // Find the outermost JSON object
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  if (!objMatch) return null;
  try {
    return JSON.parse(objMatch[0]);
  } catch {
    return null;
  }
}

async function fetchAiInsight(query: string): Promise<AiInsight | null> {
  // Fast path: check for navigation intent locally before hitting AI
  const navIntent = detectNavIntent(query);

  try {
    const engagera = getEngagera();
    const aiRes = await engagera.chat.create({
        messages: [
          {
            role: "system" as const,
            content: `You are AfuChat's intelligent search and navigation assistant. Analyze the user's query in context of the AfuChat platform and return a JSON object that helps them find what they need OR navigate directly to the right screen.

${PLATFORM_NAV_MAP}

${PLATFORM_FEATURES_GUIDE}

AfuChat search categories (for content search):
- people: user profiles, @handles, bios, organisations
- posts: text posts, articles, photo posts with hashtags/mentions
- videos: short and long video content, tutorials, vlogs
- channels: broadcast feeds by creators/brands (like Telegram channels)
- events: ticketed or free real-world/virtual events
- gifts: virtual digital gifts users send each other
- market: products, freelance services, paid communities
- jobs: job and internship listings by companies

IMPORTANT — detect the query type:
1. If the query is a NAVIGATION request ("go to wallet", "open settings", "how do I top up") → set navigateTo to the exact route path and navigateLabel to a short name, and set directAnswer to a 1-2 sentence how-to.
2. If the query is a FEATURE QUESTION ("how do I send money", "what is Nexa") → set directAnswer to a concise 2-3 sentence answer using platform knowledge, and set navigateTo if relevant.
3. If the query is a CONTENT SEARCH (looking for users/posts/videos) → set bestCategory and leave navigateTo empty.

Reply ONLY with a single JSON object — no markdown, no code fences, no explanation outside JSON:
{"summary":"1-2 sentences on what the user wants","intent":"navigation|question|person|content|video|topic|product|service|event|job|gift|community|mixed","bestCategory":"people|posts|videos|channels|events|gifts|market|jobs|all","keyTerms":["term1","term2"],"suggestions":["refined search 1","related search 2"],"explanation":"one sentence on why bestCategory is best","actions":["specific step 1","specific step 2","specific step 3"],"navigateTo":"","navigateLabel":"","directAnswer":""}

- navigateTo: exact route path like /app/afupay or /app/afupay?section=airtime (empty string if not a nav query)
- navigateLabel: short human name for the destination (empty if no nav)
- directAnswer: concise answer if this is a how-to or feature question (empty if pure content search)
- actions: 2-3 concrete steps the user should take in AfuChat`,
          },
          { role: "user" as const, content: `Search query: "${query}"` },
        ],
    });
    const raw: string = aiRes.content ?? "";
    const parsed = parseAiJson(raw);
    if (!parsed) return navIntent ? { summary: `Navigate to ${navIntent.label}`, intent: "navigation", bestCategory: "all", keyTerms: [], suggestions: [], explanation: "", actions: [], navigateTo: navIntent.route, navigateLabel: navIntent.label } : null;
    return {
      summary:       typeof parsed.summary       === "string" ? parsed.summary       : "",
      intent:        typeof parsed.intent         === "string" ? parsed.intent         : "mixed",
      bestCategory:  typeof parsed.bestCategory   === "string" ? parsed.bestCategory   : "all",
      keyTerms:      Array.isArray(parsed.keyTerms)    ? parsed.keyTerms    : [],
      suggestions:   Array.isArray(parsed.suggestions)  ? parsed.suggestions  : [],
      explanation:   typeof parsed.explanation    === "string" ? parsed.explanation    : "",
      actions:       Array.isArray(parsed.actions)     ? parsed.actions     : [],
      navigateTo:    typeof parsed.navigateTo     === "string" && parsed.navigateTo ? parsed.navigateTo : (navIntent?.route || undefined),
      navigateLabel: typeof parsed.navigateLabel  === "string" && parsed.navigateLabel ? parsed.navigateLabel : (navIntent?.label || undefined),
      directAnswer:  typeof parsed.directAnswer   === "string" && parsed.directAnswer ? parsed.directAnswer : undefined,
    } as AiInsight;
  } catch {
    return navIntent ? { summary: `Navigate to ${navIntent.label}`, intent: "navigation", bestCategory: "all", keyTerms: [], suggestions: [], explanation: "", actions: [], navigateTo: navIntent.route, navigateLabel: navIntent.label } : null;
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const VideoThumbnails = require("expo-video-thumbnails");
    VideoThumbnails.getThumbnailAsync(videoUrl, { time: 1500 })
      .then(({ uri }: { uri: string }) => {
        thumbCache.set(videoUrl, uri);
        setThumbUri(uri);
      })
      .catch(() => {});
  }, [videoUrl]);

  if (thumbUri) {
    return <ExpoImage source={{ uri: thumbUri }} style={style} contentFit="cover" cachePolicy="memory-disk" />;
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

export function SearchScreen({ title = "Search", initialTab }: { title?: string; initialTab?: SearchTab } = {}) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  // Shadow the module-level BRAND constant so every reference inside this
  // component (and all its inner functions) uses the user's chosen accent.
  const BRAND = colors.accent;

  const CATEGORIES = [
    { id: "people",   label: "People",   icon: "people",        gradient: [BRAND,  Colors.brandDark]   as [string,string] },
    { id: "posts",    label: "Posts",    icon: "document-text", gradient: [BRAND, Colors.status.info] as [string,string] },
    { id: "videos",   label: "Videos",   icon: "play-circle",   gradient: [RED,    "#FF6B6B"]   as [string,string] },
    { id: "channels", label: "Channels", icon: "megaphone",     gradient: [PURPLE, "#A855F7"]   as [string,string] },
    { id: "events",   label: "Events",   icon: "calendar",      gradient: [WARN,   "#FFCC00"]   as [string,string] },
    { id: "jobs",     label: "Jobs",     icon: "briefcase",     gradient: [SUCCESS,"#30D158"]   as [string,string] },
    { id: "gifts",    label: "Gifts",    icon: "gift",          gradient: [GOLD,   "#F59E0B"]   as [string,string] },
    { id: "market",   label: "Market",   icon: "storefront",    gradient: [INDIGO, "#7986CB"]   as [string,string] },
  ];

  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const { tag: incomingTag, q: incomingQ } = useLocalSearchParams<{ tag?: string; q?: string }>();
  const handledTagRef = useRef<string | null>(null);
  const handledQRef   = useRef<string | null>(null);

  const scrollPB = insets.bottom + 90;

  const inputRef    = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchIdRef = useRef(0);

  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<SearchTab>(initialTab ?? "all");
  const [sortMode,     setSortMode]     = useState<SortMode>("relevance");
  const [dateRange,    setDateRange]    = useState<DateRange>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [results,     setResults]     = useState<AllResults>(EMPTY);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalCount,  setTotalCount]  = useState(0);

  const [history,          setHistory]          = useState<string[]>([]);
  const [saved,            setSaved]            = useState<SavedSearch[]>([]);
  const [personalizedTags, setPersonalizedTags] = useState<string[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const [trendingPeople,   setTrendingPeople]   = useState<PersonResult[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [trendingVideos,   setTrendingVideos]   = useState<VideoResult[]>([]);

  const [lensResult, setLensResult] = useState<LensResult | null>(null);
  const [lensImageUri, setLensImageUri] = useState<string | null>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);


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
    getPersonalizedTags(14).then((tags) => { if (tags.length > 0) setPersonalizedTags(tags); }).catch(() => {});
  }

  async function loadTrendingPeople() {
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
      .eq("is_verified", true)
      .or("hide_from_search.is.null,hide_from_search.eq.false")
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
    setLoading(true); setHasSearched(true);
    const pat = `%${trimmed}%`;
    // Handles are stored without the leading @, but users commonly search
    // for them as @username. Keep the original query for text content and use
    // the normalized value for every handle lookup.
    const handleQuery = trimmed.replace(/^@+/, "").trim();
    const handlePat = handleQuery ? `%${handleQuery}%` : pat;
    const all = currentTab === "all";
    const cutoff = dateRangeCutoff(dr);

    try {
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
                  .or(`handle.ilike.${handlePat},display_name.ilike.${pat},bio.ilike.${pat}`)
                  .or("hide_from_search.is.null,hide_from_search.eq.false");
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
                .select("id, name, handle, description, avatar_url, subscriber_count")
                .or(`name.ilike.${pat},handle.ilike.${handlePat},description.ilike.${pat}`)
                .eq("is_public", true)
                .order("subscriber_count", { ascending: false })
                .limit(all ? 4 : 20)
            : Promise.resolve({ data: [] }),

          wantsChannels && trimmed.length >= 1
            ? supabase.from("chats")
                .select("id, name, handle, description, avatar_url, chat_members(count)")
                .eq("is_group", true)
                .or("is_private.is.null,is_private.eq.false")
                .or(`name.ilike.${pat},handle.ilike.${handlePat}`)
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
          badge: "Shop", seller_name: "", route: `/app/afumarket?section=product&id=${p.id}`,
        })));
        if (frees.data) marketItems.push(...frees.data.map((p: any) => ({
          id: p.id, kind: "freelance" as const, title: p.title, desc: p.description,
          emoji: p.emoji || "💼", image_url: null, price: p.price || 0,
          badge: "Freelance", seller_name: (p.profiles as any)?.display_name || "",
          route: `/app/afufreelance`,
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

      const channelIds = ((channelsRes.data || []) as any[]).map((ch: any) => ch.id).filter(Boolean);
      const { data: channelSubscriptions } = user && channelIds.length
        ? await supabase
            .from("channel_subscriptions")
            .select("channel_id")
            .eq("user_id", user.id)
            .in("channel_id", channelIds)
        : { data: [] as any[] };
      const subscribedChannelIds = new Set((channelSubscriptions || []).map((row: any) => row.channel_id));
      const channels: ChannelResult[] = ((channelsRes.data || []) as any[]).map((ch: any) => {
        return {
          id: ch.id,
          name: ch.name,
          handle: ch.handle || null,
          description: ch.description || null,
          avatar_url: ch.avatar_url || null,
          subscriber_count: ch.subscriber_count || 0,
          is_subscriber: subscribedChannelIds.has(ch.id),
        };
      });

      const groups: GroupResult[] = ((groupsRes.data || []) as any[]).map((c: any) => {
        const countArr = c.chat_members;
        const member_count = Array.isArray(countArr) && countArr[0]?.count != null ? Number(countArr[0].count) : 0;
        return {
          id: c.id,
          name: c.name || "Unnamed",
          handle: c.handle || null,
          description: c.description || null,
          avatar_url: c.avatar_url || null,
          member_count,
        };
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
      if (trimmed.length > 0) {
        addToHistory(trimmed).then(setHistory);
        trackEvent("search", { query: trimmed, tab: currentTab, results_count: total });
      }
    } catch {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, []);

  // ── Event handlers ───────────────────────────────────────────────────────────

  function onChangeText(t: string) {
    setQuery(t);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (t.trim().length === 0) {
      setResults(EMPTY); setHasSearched(false); setTotalCount(0);
      setSearchSuggestions([]); return;
    }
    getSearchSuggestions(t).then(setSearchSuggestions).catch(() => {});
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

  async function openLens() {
    if (lensLoading) return;
    Haptics.selectionAsync();
    setLensError(null);

    try {
      let permission;
      let pickerResult;
      if (Platform.OS === "web") {
        permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setLensError("Allow photo access to search with an image.");
          return;
        }
        pickerResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"] as any,
          allowsEditing: false,
          quality: 0.75,
          base64: true,
        });
      } else {
        permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setLensError("Allow camera access to search with an image.");
          return;
        }
        pickerResult = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"] as any,
          allowsEditing: false,
          quality: 0.75,
          base64: true,
        });
      }

      if (pickerResult.canceled || !pickerResult.assets?.[0]) return;
      const asset = pickerResult.assets[0];
      if (!asset.base64) {
        setLensError("That image could not be read. Please try another photo.");
        return;
      }

      setLensImageUri(asset.uri);
      setLensLoading(true);
      const response = await fetch(`${getEdgeFnBase()}/ai/lens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...edgeHeaders() },
        body: JSON.stringify({ imageBase64: asset.base64, mimeType: asset.mimeType || "image/jpeg" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Image search failed");
      }
      setLensResult({
        title: payload.title || payload.name || "Image result",
        description: payload.description || payload.answer || "AfuSearch found information about this image.",
        facts: Array.isArray(payload.facts) ? payload.facts : [],
        category: payload.category,
        confidence: payload.confidence,
        answer: payload.answer,
      });
    } catch {
      setLensError("Image search is unavailable right now. Please try again.");
    } finally {
      setLensLoading(false);
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
        <View >
          <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(`/company/${o.slug}` as any)} activeOpacity={0.75}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: GOLD + "1A", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {o.logo_url ? <ExpoImage source={{ uri: o.logo_url }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" cachePolicy="memory-disk" /> : <Ionicons name="business" size={22} color={GOLD} />}
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
        </View>
      );
    }
    const per = p as PersonResult;
    return (
      <View >
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => navigateToProfile(per.handle, true).catch(() => {})} activeOpacity={0.75}>
          <View style={{ position: "relative" }}>
            <Avatar uri={per.avatar_url} name={per.display_name} size={48} square={per.is_organization_verified} userId={per.id} />
            {per.is_verified && (
              <View style={[ss.verifyBadge, { backgroundColor: colors.background }]}>
                <Ionicons name="checkmark-circle" size={14} color={per.is_organization_verified ? GOLD : BRAND} />
              </View>
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <UserName userId={per.id} name={per.display_name} style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1} />
            <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>@{per.handle}{per.country ? ` · ${per.country}` : ""}</Text>
            {per.bio ? <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Inter_400Regular" }} numberOfLines={1}>{per.bio}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // ─── PostCard ────────────────────────────────────────────────────────────────

  function PostCard({ p, i }: { p: PostResult; i: number }) {
    return (
      <View >
        <View style={[ss.contentCard, { backgroundColor: colors.surface }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            {p.author_avatar
              ? <ExpoImage source={{ uri: p.author_avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} contentFit="cover" cachePolicy="memory-disk" />
              : <AvatarPlaceholder name={p.author_name} size={28} color={BRAND} />}
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 }}>@{p.author_handle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(p.created_at)}</Text>
          </View>
          {p.article_title && <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.text, marginBottom: 5 }} numberOfLines={2}>{p.article_title}</Text>}
          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19 }} numberOfLines={3}>{p.content}</Text>
          {p.image_url && <ExpoImage source={{ uri: p.image_url }} style={ss.postImage} contentFit="cover" cachePolicy="memory-disk" />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="eye" size={12} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{fmtNum(p.view_count)}</Text>
            </View>
            {p.post_type === "article" && (
              <View style={{ backgroundColor: PURPLE + "1A", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ color: PURPLE, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>ARTICLE</Text>
              </View>
            )}
          </View>
        </View>
      </View>
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
            <Ionicons name="eye" size={10} color="#ffffffaa" />
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
      <View >
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(`/group/${gr.id}` as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 48, borderRadius: 14, overflow: "hidden" }}>
            {gr.avatar_url
              ? <ExpoImage source={{ uri: gr.avatar_url }} style={{ width: 48, height: 48 }} contentFit="cover" cachePolicy="memory-disk" />
              : <LinearGradient colors={[BRAND, Colors.brandDark]} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="people" size={22} color="#fff" /></LinearGradient>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{gr.name}</Text>
            {gr.handle ? <Text style={[ss.rowSub, { color: BRAND }]} numberOfLines={1}>@{gr.handle}</Text> : null}
            {gr.description ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{gr.description}</Text> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="people" size={11} color={BRAND} />
              <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{fmtNum(gr.member_count)} members</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // ─── ChannelCard ─────────────────────────────────────────────────────────────

  function ChannelCard({ ch, i }: { ch: ChannelResult; i: number }) {
    return (
      <View >
        <TouchableOpacity
          style={[ss.listRow, { backgroundColor: colors.surface }]}
          onPress={() => router.push({
            pathname: "/chat/[id]",
            params: {
              id: ch.id,
              isChannel: "true",
              channelRole: ch.is_subscriber ? "member" : "",
              chatName: ch.name,
              chatAvatar: ch.avatar_url || "",
              channelHandle: ch.handle || "",
              channelDescription: ch.description || "",
            },
          } as any)}
          activeOpacity={0.75}
        >
          <View style={{ width: 48, height: 48, borderRadius: 14, overflow: "hidden" }}>
            {ch.avatar_url
              ? <ExpoImage source={{ uri: ch.avatar_url }} style={{ width: 48, height: 48 }} contentFit="cover" cachePolicy="memory-disk" />
              : <LinearGradient colors={[PURPLE, "#A855F7"]} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><Ionicons name="megaphone" size={22} color="#fff" /></LinearGradient>}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[ss.rowTitle, { color: colors.text }]} numberOfLines={1}>{ch.name}</Text>
            {ch.handle ? <Text style={[ss.rowSub, { color: PURPLE }]} numberOfLines={1}>@{ch.handle}</Text> : null}
            {ch.description
              ? <Text style={[ss.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{ch.description}</Text>
              : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="people" size={11} color={PURPLE} />
              <Text style={{ color: PURPLE, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{fmtNum(ch.subscriber_count)} subscribers</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // ─── EventCard ───────────────────────────────────────────────────────────────

  function EventCard({ ev, i }: { ev: EventResult; i: number }) {
    const d = new Date(ev.event_date);
    const sold = ev.capacity > 0 ? Math.round((ev.tickets_sold / ev.capacity) * 100) : 0;
    return (
      <View >
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push("/app/afuevents" as any)} activeOpacity={0.75}>
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
      </View>
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
            <View key={g.id} >
              <TouchableOpacity onPress={() => router.push("/app/afugifts?section=marketplace" as any)} activeOpacity={0.8} style={{ width: GIFT_W, backgroundColor: colors.surface, borderRadius: 14, padding: 10, alignItems: "center", gap: 4, borderWidth: 1, borderColor: rc + "30" }}>
                <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.text, textAlign: "center" }} numberOfLines={2}>{g.name}</Text>
                <View style={{ backgroundColor: rc + "1A", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Text style={{ color: rc, fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "capitalize" }}>{g.rarity}</Text>
                </View>
                <Text style={{ color: GOLD, fontSize: 11, fontFamily: "Inter_700Bold" }}>{formatCompactAmount(g.base_xp_cost)}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  }

  // ─── MarketCard ──────────────────────────────────────────────────────────────

  function MarketCard({ s, i }: { s: MarketResult; i: number }) {
    const c = s.kind === "product" ? BRAND : s.kind === "freelance" ? PURPLE : SUCCESS;
    return (
      <View >
        <TouchableOpacity style={[ss.listRow, { backgroundColor: colors.surface }]} onPress={() => router.push(s.route as any)} activeOpacity={0.75}>
          <View style={{ width: 48, height: 48, borderRadius: 12, overflow: "hidden", backgroundColor: c + "1A", alignItems: "center", justifyContent: "center" }}>
            {s.image_url
              ? <ExpoImage source={{ uri: s.image_url }} style={{ width: 48, height: 48 }} contentFit="cover" cachePolicy="memory-disk" />
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
      </View>
    );
  }

  // ─── JobCard ─────────────────────────────────────────────────────────────────

  function JobCard({ j, i }: { j: JobResult; i: number }) {
    const openLink = useOpenLink();
    const tc = j.job_type?.toLowerCase().includes("remote") ? SUCCESS
      : j.job_type?.toLowerCase().includes("full") ? Colors.brand
      : j.job_type?.toLowerCase().includes("part") ? WARN : BRAND;
    return (
      <View >
        <TouchableOpacity
          style={[ss.contentCard, { backgroundColor: colors.surface }]}
          onPress={() => {
            Haptics.selectionAsync();
            if (j.apply_url) openLink(j.apply_url);
            else if (j.company_slug) router.push(`/company/${j.company_slug}` as any);
          }}
          activeOpacity={0.75}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {j.company_logo
              ? <ExpoImage source={{ uri: j.company_logo }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" cachePolicy="memory-disk" />
              : <LinearGradient colors={[SUCCESS, "#30D158"]} style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Ionicons name="business" size={20} color="#fff" /></LinearGradient>}
            <View style={{ flex: 1 }}>
              <Text style={[ss.rowTitle, { color: colors.text, marginBottom: 2 }]} numberOfLines={2}>{j.title}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 7 }}>{j.company_name}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {j.job_type && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: tc + "1A", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                    <Ionicons name="briefcase" size={10} color={tc} />
                    <Text style={{ color: tc, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{j.job_type}</Text>
                  </View>
                )}
                {j.location && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                    <Ionicons name="location" size={10} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{j.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                  <Ionicons name="time" size={10} color={colors.textMuted} />
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>{timeAgo(j.created_at)}</Text>
                </View>
              </View>
            </View>
            <View style={{ backgroundColor: SUCCESS, width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="open" size={14} color="#fff" />
            </View>
          </View>
          {j.description ? <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 }} numberOfLines={2}>{j.description}</Text> : null}
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Lens result card ─────────────────────────────────────────────────────────

  function LensCard() {
    if (lensLoading) {
      return (
        <View style={[ss.lensCard, { borderColor: BRAND + "35", backgroundColor: BRAND + "0A" }]}>
          <ActivityIndicator size="small" color={BRAND} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 }}>
            Looking for matches in this image…
          </Text>
        </View>
      );
    }
    if (!lensResult) return null;
    return (
      <View style={[ss.lensCard, { borderColor: BRAND + "35", backgroundColor: colors.surface }]}>
        {lensImageUri && <ExpoImage source={{ uri: lensImageUri }} style={ss.lensImage} contentFit="cover" />}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <Ionicons name="scan-outline" size={16} color={BRAND} />
            <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.7 }}>LENS RESULT</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 4 }}>{lensResult.title}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{lensResult.description}</Text>
          {!!lensResult.facts?.length && (
            <View style={{ marginTop: 9, gap: 5 }}>
              {lensResult.facts.slice(0, 3).map((fact, i) => (
                <View key={`${fact}-${i}`} style={{ flexDirection: "row", gap: 6 }}>
                  <Text style={{ color: BRAND, fontSize: 13 }}>•</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17, flex: 1 }}>{fact}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={() => { setLensResult(null); setLensImageUri(null); }} hitSlop={10}>
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  // ─── No Results ──────────────────────────────────────────────────────────────

  function NoResults() {
    const tags = trendingHashtags.length > 0
      ? trendingHashtags.slice(0, 8)
      : (personalizedTags.length > 0 ? personalizedTags : FALLBACK_TAGS).slice(0, 8).map(t => ({ tag: t, count: 0 }));
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: scrollPB + 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: "center", paddingTop: 36, paddingHorizontal: 24 }}>
          {/* Icon cluster */}
          <View style={{ marginBottom: 20, alignItems: "center", justifyContent: "center" }}>
            <LinearGradient colors={[BRAND + "30", BRAND + "08"]} style={{ width: 110, height: 110, borderRadius: 55, alignItems: "center", justifyContent: "center" }}>
              <LinearGradient colors={[BRAND + "60", BRAND + "25"]} style={{ width: 75, height: 75, borderRadius: 38, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="search" size={36} color={BRAND} />
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

          <View style={{ width: "100%", marginBottom: 16 }}>
            <LensCard />
          </View>

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

        </View>
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
        <View style={[ss.resultsBanner, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="search" size={13} color={BRAND} />
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              <Text style={{ fontFamily: "Inter_700Bold", color: colors.text }}>{totalCount}</Text>{" "}results for{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: BRAND }}>"{query.trim()}"</Text>
            </Text>
          </View>
        </View>

        {(lensResult || lensLoading) && <View style={{ paddingHorizontal: 14, paddingTop: 14 }}><LensCard /></View>}

        {showPeople && (
          <View>
            <SectionHeader icon="people" label="People & Organizations" color={BRAND} count={results.people.length} onSeeAll={tab === "all" && results.people.length >= 5 ? () => onTabPress("people") : undefined} />
            {results.people.map((p, i) => <PersonCard key={`${(p as any).kind}-${p.id}`} p={p} i={i} />)}
          </View>
        )}
        {showPosts && (
          <View>
            <SectionHeader icon="document-text" label="Posts & Articles" color={BLUE} count={results.posts.length} onSeeAll={tab === "all" && results.posts.length >= 5 ? () => onTabPress("posts") : undefined} />
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
    const displayTags = trendingHashtags.length > 0
      ? trendingHashtags.slice(0, 10)
      : (personalizedTags.length > 0 ? personalizedTags : FALLBACK_TAGS).slice(0, 10).map(t => ({ tag: t, count: 0 }));

    const G = 10;
    const PH = 16;
    const AW = SW - PH * 2;
    const half  = (AW - G) / 2;
    const third = (AW - G * 2) / 3;

    // Subtitle copy for each browse card
    const CAT_SUB: Record<string, string> = {
      people:   "Find people & orgs",
      posts:    "Articles & photos",
      videos:   "Watch trending clips",
      channels: "Follow creators",
      events:   "Upcoming events",
      jobs:     "Career listings",
      gifts:    "Send virtual gifts",
      market:   "Buy & sell",
    };

    function BrowseCard({ cat, w, h, iconSz }: { cat: typeof CATEGORIES[0]; w: number; h: number; iconSz: number }) {
      return (
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={() => {
            const t = cat.id as SearchTab;
            onTabPress(t);
            if (t !== "videos" && t !== "jobs") setTimeout(() => inputRef.current?.focus(), 100);
          }}
          style={{ width: w, height: h, borderRadius: 22, overflow: "hidden" }}
        >
          <LinearGradient colors={cat.gradient} style={{ flex: 1, padding: 14, justifyContent: "space-between" }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            {/* Icon circle */}
            <View style={{ width: iconSz + 16, height: iconSz + 16, borderRadius: (iconSz + 16) / 2, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={cat.icon as any} size={iconSz} color="#fff" />
            </View>
            {/* Label + sub */}
            <View>
              <Text style={{ fontSize: h > 105 ? 16 : 13, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.2 }}>{cat.label}</Text>
              {h > 105 && (
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={1}>
                  {CAT_SUB[cat.id]}
                </Text>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    return (
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: scrollPB }}>

        {/* ── Recent searches ── */}
        {history.length > 0 && (
          <View style={{ paddingHorizontal: PH, paddingTop: 16, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Ionicons name="time" size={15} color={colors.textMuted} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text, flex: 1 }}>Recent</Text>
              <TouchableOpacity onPress={() => clearHistory().then(() => setHistory([]))}>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
              {history.slice(0, 8).map((term, i) => (
                <TouchableOpacity
                  key={`h-${i}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 0.5, borderColor: colors.border }}
                  onPress={() => onHistoryPress(term)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="time" size={12} color={colors.textMuted} />
                  <Text style={{ fontSize: 13, color: colors.text, fontFamily: "Inter_500Medium" }}>{term}</Text>
                  <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={() => removeFromHistory(term).then(setHistory)}>
                    <Ionicons name="close" size={12} color={colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Saved searches ── */}
        {saved.length > 0 && (
          <View style={{ paddingHorizontal: PH, paddingTop: 16, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Ionicons name="bookmark" size={15} color={GOLD} />
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text }}>Saved</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
              {saved.slice(0, 6).map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD + "14", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: GOLD + "30" }}
                  onPress={() => onHistoryPress(s.query)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="bookmark" size={12} color={GOLD} />
                  <Text style={{ fontSize: 13, color: colors.text, fontFamily: "Inter_500Medium" }}>{s.query}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Browse — Bento grid ── */}
        <View style={{ paddingTop: 22, paddingHorizontal: PH }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 16 }}>
            <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, flex: 1, letterSpacing: -0.5 }}>Browse</Text>
          </View>

          {/* Row 1: 2 large tall cards */}
          <View style={{ flexDirection: "row", gap: G }}>
            {CATEGORIES.slice(0, 2).map((cat, i) => (
              <View key={cat.id} >
                <BrowseCard cat={cat} w={half} h={130} iconSz={30} />
              </View>
            ))}
          </View>

          {/* Row 2: 3 medium cards */}
          <View style={{ flexDirection: "row", gap: G, marginTop: G }}>
            {CATEGORIES.slice(2, 5).map((cat, i) => (
              <View key={cat.id} >
                <BrowseCard cat={cat} w={third} h={100} iconSz={24} />
              </View>
            ))}
          </View>

          {/* Row 3: 3 medium cards */}
          <View style={{ flexDirection: "row", gap: G, marginTop: G }}>
            {CATEGORIES.slice(5, 8).map((cat, i) => (
              <View key={cat.id} >
                <BrowseCard cat={cat} w={third} h={100} iconSz={24} />
              </View>
            ))}
          </View>
        </View>

        {/* ── Trending hashtags — 2-col ranked grid ── */}
        {displayTags.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PH, marginBottom: 14 }}>
              <Ionicons name={trendingHashtags.length === 0 && personalizedTags.length > 0 ? "bulb-outline" as any : "flame"} size={18} color={trendingHashtags.length === 0 && personalizedTags.length > 0 ? BRAND : RED} />
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, flex: 1, letterSpacing: -0.5 }}>
                {trendingHashtags.length === 0 && personalizedTags.length > 0 ? "Based on your interests" : "Trending"}
              </Text>
              <TouchableOpacity onPress={() => { setQuery("#"); inputRef.current?.focus(); }} activeOpacity={0.7}>
                <Text style={{ fontSize: 13, color: BRAND, fontFamily: "Inter_600SemiBold" }}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: PH, flexDirection: "row", flexWrap: "wrap", gap: G }}>
              {displayTags.map(({ tag, count }, i) => (
                <View key={tag} >
                  <TouchableOpacity
                    onPress={() => onTagPress(tag)}
                    activeOpacity={0.72}
                    style={{ width: half, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 0.5, borderColor: colors.border }}
                  >
                    <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: i < 3 ? RED : colors.textMuted, width: 30, textAlign: "center", letterSpacing: -1 }}>{i + 1}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: BRAND }} numberOfLines={1}>#{tag}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted, fontFamily: "Inter_400Regular" }}>
                        {count > 0 ? `${fmtNum(count)} posts` : "Trending"}
                      </Text>
                    </View>
                    {i < 3 && <Ionicons name="flame" size={14} color={RED} />}
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── People to follow — enhanced cards ── */}
        {trendingPeople.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PH, marginBottom: 14 }}>
              <Ionicons name="people" size={18} color={BRAND} />
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, flex: 1, letterSpacing: -0.5 }}>People to follow</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PH, gap: 12 }}>
              {trendingPeople.slice(0, 10).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={{ width: 148, backgroundColor: colors.surface, borderRadius: 22, overflow: "hidden", borderWidth: 0.5, borderColor: colors.border }}
                  onPress={() => navigateToProfile(p.handle, true).catch(() => {})}
                  activeOpacity={0.8}
                >
                  {/* Gradient top band */}
                  <LinearGradient colors={[BRAND + "44", BRAND + "08"]} style={{ height: 52, alignItems: "center" }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={{ position: "absolute", bottom: -28, alignItems: "center" }}>
                      {p.avatar_url
                        ? <ExpoImage source={{ uri: p.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: colors.surface }} contentFit="cover" cachePolicy="memory-disk" />
                        : <AvatarPlaceholder name={p.display_name || p.handle} size={56} color={BRAND} />
                      }
                      {(p.is_verified || p.is_organization_verified) && (
                        <View style={{ position: "absolute", bottom: 0, right: 0, backgroundColor: colors.surface, borderRadius: 10, padding: 1 }}>
                          <Ionicons name="checkmark-circle" size={16} color={p.is_organization_verified ? GOLD : BRAND} />
                        </View>
                      )}
                    </View>
                  </LinearGradient>

                  {/* Card body */}
                  <View style={{ paddingHorizontal: 12, paddingTop: 36, paddingBottom: 14, alignItems: "center", gap: 4 }}>
                    <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.text, textAlign: "center" }} numberOfLines={1}>{p.display_name || p.handle}</Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }} numberOfLines={1}>@{p.handle}</Text>
                    {p.bio && (
                      <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: "center", lineHeight: 15, marginTop: 2 }} numberOfLines={2}>{p.bio}</Text>
                    )}
                    {p.xp != null && (
                      <View style={{ backgroundColor: BRAND + "15", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 }}>
                        <Text style={{ color: BRAND, fontSize: 11, fontFamily: "Inter_700Bold" }}>{fmtNum(p.xp)} XP</Text>
                      </View>
                    )}
                    <View style={{ marginTop: 6, backgroundColor: BRAND, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 7, width: "100%", alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" }}>Follow</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Trending videos — cinematic horizontal scroll ── */}
        {trendingVideos.length > 0 && (
          <View style={{ paddingTop: 28 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PH, marginBottom: 14 }}>
              <Ionicons name="play-circle" size={18} color={RED} />
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text, flex: 1, letterSpacing: -0.5 }}>Trending videos</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: PH, gap: 12 }}>
              {trendingVideos.slice(0, 8).map((v) => {
                const vw = SW * 0.62;
                const vh = vw * 0.58;
                return (
                  <View key={v.id} >
                    <TouchableOpacity
                      style={{ width: vw, backgroundColor: colors.surface, borderRadius: 22, overflow: "hidden", borderWidth: 0.5, borderColor: colors.border }}
                      onPress={() => router.push(`/video/${v.id}` as any)}
                      activeOpacity={0.82}
                    >
                      {/* Thumbnail */}
                      <View style={{ width: vw, height: vh, backgroundColor: colors.inputBg }}>
                        <VideoThumbnailImage videoUrl={v.video_url} imageUrl={v.image_url} style={{ width: vw, height: vh }} />
                        {/* Gradient overlay */}
                        <LinearGradient
                          colors={["transparent", "rgba(0,0,0,0.72)"]}
                          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: vh * 0.5, justifyContent: "flex-end", padding: 10 }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Ionicons name="eye" size={11} color="#fff" />
                              <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{fmtNum(v.view_count)}</Text>
                            </View>
                            {v.duration_seconds != null && (
                              <View style={{ backgroundColor: "#000000BB", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                                <Text style={{ color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                                  {Math.floor(v.duration_seconds / 60)}:{String(v.duration_seconds % 60).padStart(2, "0")}
                                </Text>
                              </View>
                            )}
                          </View>
                        </LinearGradient>
                        {/* Play button */}
                        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
                          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.52)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" }}>
                            <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 3 }} />
                          </View>
                        </View>
                      </View>

                      {/* Metadata */}
                      <View style={{ padding: 12, gap: 4 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: colors.text, lineHeight: 18 }} numberOfLines={2}>{v.content || "Video"}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                          {v.author_avatar
                            ? <ExpoImage source={{ uri: v.author_avatar }} style={{ width: 18, height: 18, borderRadius: 9 }} contentFit="cover" cachePolicy="memory-disk" />
                            : <AvatarPlaceholder name={v.author_name || v.author_handle} size={18} color={RED} />
                          }
                          <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: "Inter_500Medium" }} numberOfLines={1}>@{v.author_handle}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={[ss.root, { backgroundColor: colors.backgroundSecondary }]}>

      {/* Header */}
      <View style={[ss.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface + "CC", borderBottomColor: colors.border }]}>

        {/* Title + image search */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <TouchableOpacity onPress={() => safeRouter.back(title === "AfuSearch" ? "/apps" : "/(tabs)/discover")} hitSlop={10} style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", marginRight: 6 }} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: colors.text, letterSpacing: -0.3 }}>{title}</Text>
          </View>
        </View>

        {/* Search bar */}
        <View style={[ss.searchBar, { backgroundColor: colors.inputBg, borderColor: query.length > 0 ? BRAND + "66" : colors.border }]}>
          <Ionicons name="search" size={17} color={query.length > 0 ? BRAND : colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[ss.searchInput, { color: colors.text }]}
            placeholder="Search…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            numberOfLines={1}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0
            ? <TouchableOpacity onPress={clearSearch} hitSlop={8}><Ionicons name="close-circle" size={17} color={colors.textMuted} /></TouchableOpacity>
            : null}
          <TouchableOpacity
            onPress={openLens}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={Platform.OS === "web" ? "Search with an image" : "Search with camera"}
            hitSlop={8}
            style={[
              ss.lensInlineButton,
              {
                backgroundColor: colors.text + "18",
              },
            ]}
          >
            {lensLoading
              ? <ActivityIndicator size="small" color={colors.text} />
              : <Ionicons name="scan" size={22} color={colors.text} />}
          </TouchableOpacity>
        </View>
        {!!lensError && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 4, paddingTop: 6 }}>
            <Ionicons name="alert-circle-outline" size={15} color={RED} />
            <Text style={{ color: RED, fontSize: 12, flex: 1 }}>{lensError}</Text>
            <TouchableOpacity onPress={() => setLensError(null)} hitSlop={8}>
              <Ionicons name="close" size={15} color={RED} />
            </TouchableOpacity>
          </View>
        )}

        {/* Inline search suggestions — appear while typing, before submitting */}
        {query.length > 1 && !hasSearched && searchSuggestions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ gap: 6, paddingVertical: 6 }}
          >
            {searchSuggestions.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => { setQuery(s); setSearchSuggestions([]); performSearch(s, tab, verifiedOnly, sortMode, dateRange); inputRef.current?.blur(); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.inputBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border }}
                activeOpacity={0.75}
              >
                <Ionicons name="time" size={13} color={colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 13, fontFamily: "Inter_400Regular" }} numberOfLines={1}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Filter pills — only shown when actively searching */}
        {(query.length > 0 || hasSearched) && (
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
              <Ionicons name={s === "relevance" ? "flash" : s === "recent" ? "time" : "trending-up"} size={12} color={sortMode === s ? BRAND : colors.textMuted} />
              <Text style={{ color: sortMode === s ? BRAND : colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "capitalize" }}>{s}</Text>
            </TouchableOpacity>
          ))}
          {(["all", "24h", "7d", "30d"] as DateRange[]).map(dr => (
            <TouchableOpacity key={dr} style={[ss.filterPill, dateRange === dr && dr !== "all" && { backgroundColor: BRAND + "18", borderColor: BRAND + "44" }]} onPress={() => onDatePress(dr)}>
              <Text style={{ color: dateRange === dr && dr !== "all" ? BRAND : colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium" }}>{dr}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        )}

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

      {(lensResult || lensLoading) && !hasSearched && (
        <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          <LensCard />
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

export default function SearchRoute() {
  return <SearchScreen />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    zIndex: 20,
    overflow: "visible" as any,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 13,
    height: 44,
    gap: 9,
    borderWidth: 0.5,
    marginBottom: 2,
    ...Platform.select({
      web: { boxShadow: "0 4px 20px rgba(0,0,0,0.13)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 8 },
    }),
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      } as any,
    }),
  },
  lensInlineButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
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
  },

  lensCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  lensImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  },

  postImage: {
    width: "100%" as any,
    height: 160,
    borderRadius: 10,
    marginTop: 10,
  },
});
