import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { supabase } from "@/lib/supabase";
import { RichText } from "@/components/ui/RichText";
import {
  getSearchHistory,
  addToHistory,
  removeFromHistory,
  clearHistory,
  getSavedSearches,
  saveSearch,
  removeSavedSearch,
  type SavedSearch,
} from "@/lib/searchStore";
import { useVideoProgress } from "@/hooks/useVideoProgress";

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = "#00BCD4";
const PURPLE  = "#8B5CF6";
const GOLD    = "#D4A853";
const SUCCESS = "#34C759";
const WARN    = "#FF9500";
const MATCH   = "#FF2D55";

const RARITY_COLORS: Record<string, string> = {
  common: "#9E9E9E", uncommon: "#00BCD4", rare: "#2979FF",
  epic: "#CE93D8", legendary: "#FFB74D",
};

const TRENDING_TAGS = [
  "gaming","photography","music","travel","coding",
  "fitness","cooking","art","fashion","tech","crypto","design",
];

type SearchTab = "all" | "people" | "posts" | "videos" | "channels" | "events" | "gifts" | "market" | "jobs";
type SortMode  = "relevance" | "recent" | "popular";
type DateRange = "all" | "24h" | "7d" | "30d";

const TABS: { id: SearchTab; label: string; icon: string }[] = [
  { id: "all",      label: "All",       icon: "apps-outline" },
  { id: "people",   label: "People",    icon: "people-outline" },
  { id: "posts",    label: "Posts",     icon: "document-text-outline" },
  { id: "videos",   label: "Videos",    icon: "play-circle-outline" },
  { id: "channels", label: "Channels",  icon: "megaphone-outline" },
  { id: "events",   label: "Events",    icon: "calendar-outline" },
  { id: "jobs",     label: "Jobs",      icon: "briefcase-outline" },
  { id: "gifts",    label: "Gifts",     icon: "gift-outline" },
  { id: "market",   label: "Market",    icon: "storefront-outline" },
];

const QUICK_CATEGORIES = [
  { id: "people",   label: "People",   icon: "people",        gradient: [BRAND, "#0097A7"]      as [string,string], route: null },
  { id: "posts",    label: "Posts",    icon: "document-text", gradient: ["#007AFF", "#0A84FF"]  as [string,string], route: null },
  { id: "videos",   label: "Videos",   icon: "play-circle",   gradient: ["#FF3B30", "#FF453A"]  as [string,string], route: null },
  { id: "channels", label: "Channels", icon: "megaphone",     gradient: ["#AF52DE", "#BF5AF2"]  as [string,string], route: null },
  { id: "events",   label: "Events",   icon: "calendar",      gradient: [WARN, "#FFCC00"]       as [string,string], route: "/digital-events" },
  { id: "jobs",     label: "Jobs",     icon: "briefcase",     gradient: ["#34C759", "#30D158"]  as [string,string], route: null },
  { id: "gifts",    label: "Gifts",    icon: "gift",          gradient: ["#FF3B30", "#FF453A"]  as [string,string], route: "/gifts" },
  { id: "market",   label: "Market",   icon: "storefront",    gradient: ["#AF52DE", "#BF5AF2"]  as [string,string], route: "/store" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonResult  = { id:string; handle:string; display_name:string; avatar_url:string|null; bio:string|null; is_verified:boolean; is_organization_verified:boolean; current_grade:string; country:string|null; xp?:number; kind:"profile" };
type OrgPageResult = { id:string; name:string; slug:string; logo_url:string|null; description:string|null; kind:"org" };
type PostResult    = { id:string; content:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; post_type:string; article_title:string|null };
type VideoResult   = { id:string; content:string; video_url:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string; audio_name:string|null; duration_seconds:number|null };
type ChannelResult = { id:string; name:string; description:string|null; avatar_url:string|null; subscriber_count:number };
type EventResult   = { id:string; title:string; description:string|null; emoji:string; price:number; event_date:string; capacity:number; tickets_sold:number; category:string|null; creator_name:string; creator_handle:string };
type GiftResult    = { id:string; name:string; emoji:string; base_xp_cost:number; rarity:string; description:string|null };
type MarketResult  = { id:string; kind:"product"|"freelance"|"community"; title:string; desc:string|null; emoji:string|null; image_url:string|null; price:number; badge:string|null; seller_name:string; route:string };
type JobResult     = { id:string; title:string; job_type:string|null; location:string|null; description:string|null; apply_url:string|null; created_at:string; company_name:string; company_logo:string|null; company_slug:string|null };
type AiInsight     = { summary:string; suggestions:string[] };

type AllResults = {
  people:   (PersonResult|OrgPageResult)[];
  posts:    PostResult[];
  videos:   VideoResult[];
  channels: ChannelResult[];
  events:   EventResult[];
  gifts:    GiftResult[];
  market:   MarketResult[];
  jobs:     JobResult[];
};

const EMPTY: AllResults = { people:[], posts:[], videos:[], channels:[], events:[], gifts:[], market:[], jobs:[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso:string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const d = Math.floor(h/24); if (d < 30) return `${d}d`;
  return `${Math.floor(d/30)}mo`;
}

function fmtEventDate(iso:string) {
  return new Date(iso).toLocaleDateString("en-US",{ month:"short", day:"numeric", year:"numeric" });
}

function fmtNum(n:number) {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return String(n);
}

function getApiBase(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  const domain = (process.env.EXPO_PUBLIC_DOMAIN || "").trim();
  return domain ? `https://${domain}` : "http://localhost:3000";
}

function dateRangeCutoff(range: DateRange): string | null {
  if (range === "all") return null;
  const ms = range === "24h" ? 86400000 : range === "7d" ? 604800000 : 2592000000;
  return new Date(Date.now() - ms).toISOString();
}

function highlightText(text: string, query: string, baseColor: string, highlightColor: string) {
  if (!query || query.length < 2) return <Text style={{ color: baseColor }}>{text}</Text>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <Text style={{ color: baseColor }}>{text}</Text>;
  return (
    <Text style={{ color: baseColor }}>
      {text.slice(0, idx)}
      <Text style={{ color: highlightColor, fontFamily:"Inter_700Bold" }}>{text.slice(idx, idx+query.length)}</Text>
      {text.slice(idx+query.length)}
    </Text>
  );
}

// ─── AI Insight Fetcher ───────────────────────────────────────────────────────

async function fetchAiInsight(query: string): Promise<AiInsight | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are AfuChat's search AI. Given a search query, reply ONLY with JSON in this exact format (no markdown, no extra text):
{"summary":"one sentence describing what the user is likely looking for","suggestions":["related search 1","related search 2","related search 3"]}`,
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
    return JSON.parse(match[0]) as AiInsight;
  } catch {
    return null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarPlaceholder({ name, size, color, style }: { name:string; size:number; color:string; style?:any }) {
  return (
    <View style={[{ width:size, height:size, borderRadius:size/2, alignItems:"center", justifyContent:"center", backgroundColor:color+"22" }, style]}>
      <Text style={{ color, fontSize:size*0.4, fontFamily:"Inter_700Bold" }}>{(name||"?")[0].toUpperCase()}</Text>
    </View>
  );
}

function SkeletonBox({ w, h, r }: { w:number|string; h:number; r:number }) {
  const { colors } = useTheme();
  return <View style={{ width:w as any, height:h, borderRadius:r, backgroundColor:colors.inputBg, opacity:0.7 }} />;
}

function CardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[ss.card, { backgroundColor:colors.surface }]}>
      <SkeletonBox w={44} h={44} r={22} />
      <View style={{ flex:1, gap:6 }}>
        <SkeletonBox w="60%" h={13} r={6} />
        <SkeletonBox w="40%" h={11} r={6} />
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const { tag: incomingTag, q: incomingQ } = useLocalSearchParams<{ tag?:string; q?:string }>();
  const handledTagRef = useRef<string|null>(null);
  const handledQRef   = useRef<string|null>(null);
  const { isDesktop } = useIsDesktop();

  const scrollPB  = insets.bottom + 52 + 16;

  const inputRef     = useRef<TextInput>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const suggestRef   = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const searchIdRef  = useRef(0);

  const [query,        setQuery]        = useState("");
  const [tab,          setTab]          = useState<SearchTab>("all");
  const [sortMode,     setSortMode]     = useState<SortMode>("relevance");
  const [dateRange,    setDateRange]    = useState<DateRange>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [aiMode,       setAiMode]       = useState(false);

  const [loading,      setLoading]      = useState(false);
  const [results,      setResults]      = useState<AllResults>(EMPTY);
  const [hasSearched,  setHasSearched]  = useState(false);
  const [totalCount,   setTotalCount]   = useState(0);

  const [history,     setHistory]     = useState<string[]>([]);
  const [saved,       setSaved]       = useState<SavedSearch[]>([]);
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  const [trendingPeople,   setTrendingPeople]   = useState<PersonResult[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag:string; count:number }[]>([]);
  const [trendingVideos,   setTrendingVideos]   = useState<VideoResult[]>([]);

  const [aiInsight,   setAiInsight]   = useState<AiInsight|null>(null);
  const [aiLoading,   setAiLoading]   = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    loadInitial();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestRef.current)  clearTimeout(suggestRef.current);
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
    if (data) setTrendingPeople(data.map((p:any) => ({ ...p, kind:"profile" })));
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
      const scores: Record<string,number> = {};
      for (const p of data) {
        if (!p.content) continue;
        RE.lastIndex = 0;
        let m: RegExpExecArray|null;
        while ((m = RE.exec(p.content))) {
          const t = m[1].toLowerCase();
          scores[t] = (scores[t]||0) + 1 + Math.log1p(p.view_count||0)*0.15;
        }
      }
      setTrendingHashtags(
        Object.entries(scores)
          .sort((a,b) => b[1]-a[1])
          .slice(0,20)
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
        .limit(6);
      if (!data || data.length === 0) return;
      const ids = [...new Set(data.map((v:any) => v.author_id))] as string[];
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
      const pm = new Map((profiles||[]).map((p:any) => [p.id, p]));
      setTrendingVideos(data.map((v:any) => {
        const a = pm.get(v.author_id)||{} as any;
        return { id:v.id, content:v.content||"", video_url:v.video_url, image_url:v.image_url||null, author_id:v.author_id, author_handle:a.handle||"", author_name:a.display_name||"", author_avatar:a.avatar_url||null, view_count:v.view_count||0, created_at:v.created_at, audio_name:v.audio_name||null, duration_seconds:null };
      }));
    } catch {}
  }

  async function fetchSuggestions(text: string) {
    if (text.length < 2) { setSuggestions([]); setShowSuggest(false); return; }
    const { data } = await supabase.from("profiles")
      .select("id, handle, display_name, avatar_url, is_verified, is_organization_verified, current_grade, country, bio, xp")
      .or(`handle.ilike.%${text}%,display_name.ilike.%${text}%`)
      .order("xp", { ascending: false })
      .limit(6);
    if (data && data.length > 0) {
      setSuggestions(data.map((p:any) => ({ ...p, kind:"profile" })));
      setShowSuggest(true);
    } else {
      setSuggestions([]); setShowSuggest(false);
    }
  }

  // ── Main search ─────────────────────────────────────────────────────────────

  const performSearch = useCallback(async (
    q: string, currentTab: SearchTab, vOnly: boolean,
    sort: SortMode, dr: DateRange,
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
      // ── AI insight (fire-and-forget parallel) ──────────────────────────────
      if (aiMode && trimmed.length >= 3) {
        setAiLoading(true);
        fetchAiInsight(trimmed)
          .then((insight) => { if (insight && id === searchIdRef.current) setAiInsight(insight); })
          .finally(() => setAiLoading(false));
      }

      // ── Parallel Supabase queries ──────────────────────────────────────────
      const wantsPeople   = all || currentTab === "people";
      const wantsPosts    = all || currentTab === "posts";
      const wantsVideos   = all || currentTab === "videos";
      const wantsChannels = all || currentTab === "channels";
      const wantsEvents   = all || currentTab === "events";
      const wantsGifts    = all || currentTab === "gifts";
      const wantsMarket   = all || currentTab === "market";
      const wantsJobs     = all || currentTab === "jobs";

      const [peopleRes, orgPageRes, postsRes, videosRes, channelsRes, eventsRes, giftsRes, jobsRes] =
        await Promise.all([
          // People (profiles)
          wantsPeople
            ? (() => {
                let pq = supabase.from("profiles")
                  .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
                  .or(`handle.ilike.${pat},display_name.ilike.${pat},bio.ilike.${pat}`);
                if (vOnly) pq = pq.eq("is_verified", true);
                if (sort === "popular") pq = pq.order("xp", { ascending: false });
                else pq = pq.order("xp", { ascending: false });
                return pq.limit(all ? 5 : 25);
              })()
            : Promise.resolve({ data: [] }),

          // Organization pages (searched together with people)
          wantsPeople
            ? supabase.from("organization_pages")
                .select("id, name, slug, logo_url, description")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .limit(all ? 3 : 10)
            : Promise.resolve({ data: [] }),

          // Posts (non-video)
          wantsPosts
            ? (() => {
                let pq = supabase.from("posts")
                  .select("id, content, image_url, author_id, view_count, created_at, post_type, article_title")
                  .ilike("content", pat)
                  .eq("visibility", "public")
                  .neq("post_type", "video");
                if (cutoff) pq = pq.gte("created_at", cutoff);
                if (sort === "recent" || sort === "relevance") pq = pq.order("created_at", { ascending: false });
                else pq = pq.order("view_count", { ascending: false });
                return pq.limit(all ? 5 : 30);
              })()
            : Promise.resolve({ data: [] }),

          // Videos
          wantsVideos
            ? (() => {
                let vq = supabase.from("posts")
                  .select("id, content, video_url, image_url, author_id, view_count, created_at, audio_name, video_assets(duration_seconds)")
                  .eq("post_type", "video")
                  .eq("visibility", "public")
                  .not("video_url", "is", null);
                if (trimmed.length > 0) vq = vq.ilike("content", pat);
                if (cutoff) vq = vq.gte("created_at", cutoff);
                if (sort === "recent") vq = vq.order("created_at", { ascending: false });
                else vq = vq.order("view_count", { ascending: false });
                return vq.limit(all ? 4 : 30);
              })()
            : Promise.resolve({ data: [] }),

          // Channels
          wantsChannels
            ? supabase.from("channels")
                .select("id, name, description, avatar_url, subscriber_count")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .order("subscriber_count", { ascending: false })
                .limit(all ? 4 : 20)
            : Promise.resolve({ data: [] }),

          // Events
          wantsEvents
            ? (() => {
                let eq = supabase.from("digital_events")
                  .select("id, title, description, emoji, price, event_date, capacity, tickets_sold, creator_id, category, profiles!digital_events_creator_id_fkey(display_name, handle)")
                  .or(`title.ilike.${pat},description.ilike.${pat}`)
                  .gte("event_date", new Date().toISOString())
                  .order("event_date", { ascending: true });
                return eq.limit(all ? 3 : 20);
              })()
            : Promise.resolve({ data: [] }),

          // Gifts
          wantsGifts
            ? supabase.from("gifts")
                .select("id, name, emoji, base_xp_cost, rarity, description")
                .or(`name.ilike.${pat},description.ilike.${pat}`)
                .order("base_xp_cost", { ascending: true })
                .limit(all ? 6 : 30)
            : Promise.resolve({ data: [] }),

          // Jobs
          wantsJobs
            ? supabase.from("org_page_jobs")
                .select("id, title, job_type, location, description, apply_url, created_at, organization_pages!org_page_jobs_page_id_fkey(name, logo_url, slug)")
                .eq("is_active", true)
                .or(trimmed.length > 0 ? `title.ilike.${pat},description.ilike.${pat}` : "id.neq.00000000-0000-0000-0000-000000000000")
                .order("created_at", { ascending: false })
                .limit(all ? 4 : 25)
            : Promise.resolve({ data: [] }),
        ]);

      // Market queries (separate because they need 3 sub-queries)
      let marketItems: MarketResult[] = [];
      if (wantsMarket && trimmed.length > 0) {
        const [prods, frees, comms] = await Promise.all([
          supabase.from("shop_products").select("id, name, description, images, price_acoin, category, seller_id").ilike("name", pat).eq("is_available", true).limit(all ? 3 : 15),
          supabase.from("freelance_listings").select("id, title, description, price, emoji, seller_id, orders_count, profiles!freelance_listings_seller_id_fkey(display_name, handle)").or(`title.ilike.${pat},description.ilike.${pat}`).eq("is_active", true).limit(all ? 3 : 15),
          supabase.from("paid_communities").select("id, name, description, emoji, price, member_count, creator_id, profiles!paid_communities_creator_id_fkey(display_name, handle)").or(`name.ilike.${pat},description.ilike.${pat}`).limit(all ? 2 : 10),
        ]);
        marketItems = [
          ...(prods.data||[]).map((p:any) => ({ id:p.id, kind:"product" as const, title:p.name, desc:p.description, emoji:null, image_url:Array.isArray(p.images)&&p.images.length>0?p.images[0]:null, price:p.price_acoin??0, badge:p.category, seller_name:"", route:`/shop/${p.seller_id}` })),
          ...(frees.data||[]).map((f:any) => ({ id:f.id, kind:"freelance" as const, title:f.title, desc:f.description, emoji:f.emoji, image_url:null, price:f.price, badge:`${f.orders_count} orders`, seller_name:f.profiles?.display_name||"", route:"/freelance" })),
          ...(comms.data||[]).map((c:any) => ({ id:c.id, kind:"community" as const, title:c.name, desc:c.description, emoji:c.emoji, image_url:null, price:c.price, badge:`${c.member_count} members`, seller_name:c.profiles?.display_name||"", route:"/paid-communities" })),
        ];
      }

      if (id !== searchIdRef.current) return;

      // Build author map for posts + videos
      const allAuthorIds = [...(postsRes.data||[]).map((p:any)=>p.author_id), ...(videosRes.data||[]).map((v:any)=>v.author_id)];
      const uniqIds = [...new Set(allAuthorIds)] as string[];
      let amap = new Map<string,any>();
      if (uniqIds.length > 0) {
        const { data: auths } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", uniqIds);
        amap = new Map((auths||[]).map((a:any) => [a.id, a]));
      }

      const people: (PersonResult|OrgPageResult)[] = [
        ...(peopleRes.data||[]).map((p:any) => ({ ...p, kind:"profile" as const })),
        ...(orgPageRes.data||[]).map((o:any) => ({ id:o.id, name:o.name, slug:o.slug, logo_url:o.logo_url||null, description:o.description||null, kind:"org" as const })),
      ];

      const posts: PostResult[] = (postsRes.data||[]).map((p:any) => {
        const a = amap.get(p.author_id)||{} as any;
        return { id:p.id, content:p.content, image_url:p.image_url||null, author_id:p.author_id, author_handle:a.handle||"", author_name:a.display_name||"", author_avatar:a.avatar_url||null, view_count:p.view_count||0, created_at:p.created_at, post_type:p.post_type||"text", article_title:p.article_title||null };
      });

      const videos: VideoResult[] = (videosRes.data||[]).map((v:any) => {
        const a = amap.get(v.author_id)||{} as any;
        const arr = Array.isArray(v.video_assets) ? v.video_assets : (v.video_assets ? [v.video_assets] : []);
        return { id:v.id, content:v.content||"", video_url:v.video_url, image_url:v.image_url||null, author_id:v.author_id, author_handle:a.handle||"", author_name:a.display_name||"", author_avatar:a.avatar_url||null, view_count:v.view_count||0, created_at:v.created_at, audio_name:v.audio_name||null, duration_seconds:arr.length>0?arr[0].duration_seconds??null:null };
      });

      const channels: ChannelResult[] = channelsRes.data||[];

      const events: EventResult[] = (eventsRes.data||[]).map((e:any) => ({
        id:e.id, title:e.title, description:e.description, emoji:e.emoji||"🎉", price:e.price||0, event_date:e.event_date, capacity:e.capacity||0, tickets_sold:e.tickets_sold||0, category:e.category, creator_name:e.profiles?.display_name||"", creator_handle:e.profiles?.handle||"",
      }));

      const gifts: GiftResult[] = giftsRes.data||[];

      const jobs: JobResult[] = (jobsRes.data||[]).map((j:any) => ({
        id:j.id, title:j.title, job_type:j.job_type||null, location:j.location||null, description:j.description||null, apply_url:j.apply_url||null, created_at:j.created_at,
        company_name:(j.organization_pages as any)?.name||"Company", company_logo:(j.organization_pages as any)?.logo_url||null, company_slug:(j.organization_pages as any)?.slug||null,
      }));

      const total = people.length + posts.length + videos.length + channels.length + events.length + gifts.length + marketItems.length + jobs.length;
      setResults({ people, posts, videos, channels, events, gifts, market:marketItems, jobs });
      setTotalCount(total);
    } catch (e) {
      console.warn("[Search] error:", e);
    } finally {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, [aiMode]);

  // ── Navigation params ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!incomingTag || incomingTag === handledTagRef.current) return;
    handledTagRef.current = incomingTag;
    const q = `#${incomingTag}`;
    setQuery(q); setTab("posts"); setHasSearched(false);
    addToHistory(q).then(setHistory);
    performSearch(q, "posts", false, "popular", "all");
  }, [incomingTag, performSearch]);

  useEffect(() => {
    const incoming = (incomingQ||"").trim();
    if (!incoming || incoming === handledQRef.current) return;
    handledQRef.current = incoming;
    setQuery(incoming); setHasSearched(false);
    addToHistory(incoming).then(setHistory);
    performSearch(incoming, tab, verifiedOnly, sortMode, dateRange);
  }, [incomingQ, performSearch, tab, verifiedOnly, sortMode, dateRange]);

  // ── Event handlers ───────────────────────────────────────────────────────────

  function onChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suggestRef.current)  clearTimeout(suggestRef.current);
    // Smart routing: @handle → people, #tag → posts
    const t = text.trim();
    if (t.startsWith("@") && t.length >= 2) {
      debounceRef.current = setTimeout(() => performSearch(t.slice(1), "people", verifiedOnly, sortMode, dateRange), 350);
    } else if (t.startsWith("#") && t.length >= 2) {
      debounceRef.current = setTimeout(() => performSearch(t, "posts", verifiedOnly, sortMode, dateRange), 350);
    } else {
      debounceRef.current = setTimeout(() => performSearch(text, tab, verifiedOnly, sortMode, dateRange), 380);
    }
    suggestRef.current = setTimeout(() => fetchSuggestions(text), 180);
  }

  function onSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowSuggest(false);
    const t = query.trim();
    if (t.length >= 1) {
      addToHistory(t).then(setHistory);
      performSearch(query, tab, verifiedOnly, sortMode, dateRange);
    }
  }

  function onTabPress(t: SearchTab) {
    setTab(t); Haptics.selectionAsync();
    if (query.trim().length >= 1 || t === "videos" || t === "jobs") performSearch(query, t, verifiedOnly, sortMode, dateRange);
  }

  function clearSearch() {
    setQuery(""); setResults(EMPTY); setHasSearched(false);
    setTotalCount(0); setSuggestions([]); setShowSuggest(false);
    setAiInsight(null);
    inputRef.current?.focus();
  }

  function onTagPress(tag: string) {
    const q = `#${tag}`; setQuery(q); setTab("posts"); setShowSuggest(false);
    addToHistory(q).then(setHistory);
    performSearch(q, "posts", verifiedOnly, "popular", dateRange);
  }

  function onHistoryPress(term: string) {
    setQuery(term); setShowSuggest(false);
    performSearch(term, tab, verifiedOnly, sortMode, dateRange);
  }

  function toggleVerified() {
    const nv = !verifiedOnly; setVerifiedOnly(nv);
    if (query.trim().length >= 1) performSearch(query, tab, nv, sortMode, dateRange);
  }

  function onSortPress(s: SortMode) {
    setSortMode(s);
    if (query.trim().length >= 1) performSearch(query, tab, verifiedOnly, s, dateRange);
  }

  function onDateRangePress(dr: DateRange) {
    setDateRange(dr);
    if (query.trim().length >= 1) performSearch(query, tab, verifiedOnly, sortMode, dr);
  }

  function toggleAiMode() {
    const next = !aiMode; setAiMode(next);
    Haptics.selectionAsync();
    if (next && query.trim().length >= 3) performSearch(query, tab, verifiedOnly, sortMode, dateRange);
  }

  function startVoice() {
    if (Platform.OS !== "web") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.interimResults = false;
    setIsListening(true);
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setQuery(t); setIsListening(false);
      addToHistory(t).then(setHistory);
      performSearch(t, tab, verifiedOnly, sortMode, dateRange);
    };
    r.onerror = r.onend = () => setIsListening(false);
    r.start();
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const tabCounts = useMemo<Record<SearchTab,number>>(() => ({
    all:      totalCount,
    people:   results.people.length,
    posts:    results.posts.length,
    videos:   results.videos.length,
    channels: results.channels.length,
    events:   results.events.length,
    gifts:    results.gifts.length,
    market:   results.market.length,
    jobs:     results.jobs.length,
  }), [results, totalCount]);

  const cleanQuery = query.trim().replace(/^[#@]/, "");

  // ── Card renderers ───────────────────────────────────────────────────────────

  function AiInsightCard() {
    if (!aiMode) return null;
    if (aiLoading && !aiInsight) {
      return (
        <View style={[ss.aiCard, { backgroundColor: PURPLE+"18", borderColor: PURPLE+"30" }]}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
            <Ionicons name="sparkles" size={16} color={PURPLE} />
            <Text style={{ color:PURPLE, fontSize:13, fontFamily:"Inter_600SemiBold" }}>AI is analyzing…</Text>
            <ActivityIndicator size="small" color={PURPLE} style={{ marginLeft:"auto" as any }} />
          </View>
        </View>
      );
    }
    if (!aiInsight) return null;
    return (
      <Animated.View entering={FadeInDown.duration(300)}>
        <LinearGradient
          colors={[PURPLE+"22", PURPLE+"08"]}
          style={[ss.aiCard, { borderColor: PURPLE+"35" }]}
        >
          <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:10 }}>
            <LinearGradient colors={[PURPLE, "#6366F1"]} style={ss.aiIconWrap}>
              <Ionicons name="sparkles" size={14} color="#fff" />
            </LinearGradient>
            <Text style={{ color:PURPLE, fontSize:14, fontFamily:"Inter_700Bold", flex:1 }}>AI Insights</Text>
            <TouchableOpacity onPress={() => setAiInsight(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={PURPLE} />
            </TouchableOpacity>
          </View>
          <Text style={{ color:colors.text, fontSize:13, fontFamily:"Inter_400Regular", lineHeight:19, marginBottom:12 }}>
            {aiInsight.summary}
          </Text>
          {aiInsight.suggestions.length > 0 && (
            <>
              <Text style={{ color:colors.textMuted, fontSize:11, fontFamily:"Inter_600SemiBold", marginBottom:8, textTransform:"uppercase", letterSpacing:0.5 }}>Related Searches</Text>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6 }}>
                {aiInsight.suggestions.map((s) => (
                  <TouchableOpacity key={s} onPress={() => { setQuery(s); performSearch(s, tab, verifiedOnly, sortMode, dateRange); }} style={[ss.aiSuggestChip, { borderColor:PURPLE+"40" }]}>
                    <Ionicons name="search-outline" size={11} color={PURPLE} />
                    <Text style={{ color:PURPLE, fontSize:12, fontFamily:"Inter_500Medium" }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </LinearGradient>
      </Animated.View>
    );
  }

  function PersonCard({ p, i }: { p: PersonResult|OrgPageResult; i: number }) {
    const isOrg = p.kind === "org";
    const orgP  = p as OrgPageResult;
    const profP = p as PersonResult;
    const name  = isOrg ? orgP.name : profP.display_name;
    const sub   = isOrg ? `Company · ${orgP.slug}` : `@${profP.handle}${profP.country ? ` · ${profP.country}` : ""}`;
    const bio   = isOrg ? orgP.description : profP.bio;
    const avatar= isOrg ? orgP.logo_url : profP.avatar_url;
    const route = isOrg ? `/company/${orgP.slug}` : `/contact/${profP.id}`;

    return (
      <Animated.View entering={FadeInRight.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface }]} onPress={() => { Haptics.selectionAsync(); router.push(route as any); }} activeOpacity={0.75}>
          <View style={ss.av48Wrap}>
            {avatar
              ? <Image source={{ uri: avatar }} style={isOrg ? [ss.av48, { borderRadius:12 }] : ss.av48} />
              : <AvatarPlaceholder name={name} size={48} color={isOrg ? WARN : BRAND} />
            }
            {!isOrg && profP.is_organization_verified && (
              <View style={ss.orgDot}><Ionicons name="checkmark-circle" size={14} color={GOLD} /></View>
            )}
            {isOrg && (
              <View style={ss.orgDot}><Ionicons name="business" size={12} color={WARN} /></View>
            )}
          </View>
          <View style={{ flex:1, gap:2 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:4 }}>
              <Text style={[ss.cardTitle, { color:colors.text }]} numberOfLines={1}>{highlightText(name, cleanQuery, colors.text, BRAND)}</Text>
              {!isOrg && profP.is_verified && !profP.is_organization_verified && <Ionicons name="checkmark-circle" size={13} color={BRAND} />}
            </View>
            <Text style={[ss.cardSub, { color:colors.textMuted }]}>{sub}</Text>
            {bio ? <Text style={[ss.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{bio}</Text> : null}
          </View>
          <View style={[ss.viewBtn, { backgroundColor: (isOrg ? WARN : BRAND)+"18" }]}>
            <Text style={{ color: isOrg ? WARN : BRAND, fontSize:12, fontFamily:"Inter_600SemiBold" }}>View</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function PostCard({ p, i }: { p: PostResult; i: number }) {
    const hasImage = !!p.image_url;
    const isArticle = p.post_type === "article";
    const route = isArticle ? `/article/${p.id}` : `/p/${p.id}`;
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface, flexDirection:"column", gap:10 }]} onPress={() => { Haptics.selectionAsync(); router.push(route as any); }} activeOpacity={0.75}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); router.push(`/contact/${p.author_id}` as any); }} hitSlop={{ top:4, bottom:4, left:4, right:4 }}>
              {p.author_avatar
                ? <Image source={{ uri: p.author_avatar }} style={ss.av36} />
                : <AvatarPlaceholder name={p.author_name} size={36} color="#007AFF" />}
            </TouchableOpacity>
            <TouchableOpacity style={{ flex:1 }} onPress={(e) => { e.stopPropagation(); router.push(`/contact/${p.author_id}` as any); }}>
              <Text style={[ss.cardTitle, { color:colors.text, fontSize:13 }]} numberOfLines={1}>{p.author_name}</Text>
              <Text style={[ss.cardSub, { color:colors.textMuted }]}>@{p.author_handle}</Text>
            </TouchableOpacity>
            <View style={[ss.timeChip, { backgroundColor:colors.backgroundSecondary }]}>
              <Text style={{ color:colors.textMuted, fontSize:10, fontFamily:"Inter_500Medium" }}>{timeAgo(p.created_at)}</Text>
            </View>
          </View>
          {isArticle ? (
            <View style={{ borderRadius:12, borderWidth:1, borderColor:BRAND+"20", overflow:"hidden", backgroundColor:colors.backgroundSecondary }}>
              {hasImage && <Image source={{ uri:p.image_url! }} style={{ width:"100%", height:110 }} resizeMode="cover" />}
              <View style={{ padding:12, gap:6 }}>
                <View style={{ flexDirection:"row", alignItems:"center", gap:5, alignSelf:"flex-start", backgroundColor:BRAND+"15", paddingHorizontal:10, paddingVertical:3, borderRadius:8 }}>
                  <Ionicons name="document-text" size={11} color={BRAND} />
                  <Text style={{ fontSize:11, fontFamily:"Inter_600SemiBold", color:BRAND }}>Article</Text>
                </View>
                {p.article_title ? <Text style={{ fontSize:15, fontFamily:"Inter_700Bold", color:colors.text }} numberOfLines={2}>{p.article_title}</Text> : null}
                <RichText style={{ color:colors.textSecondary, fontSize:13, lineHeight:19 }} numberOfLines={2}>{p.content}</RichText>
              </View>
            </View>
          ) : (
            <>
              <RichText style={{ color:colors.text, fontSize:14, lineHeight:21 }} numberOfLines={hasImage ? 2 : 4}>{p.content}</RichText>
              {hasImage && <Image source={{ uri:p.image_url! }} style={{ width:"100%", height:150, borderRadius:12 }} resizeMode="cover" />}
            </>
          )}
          <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
            <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
            <Text style={{ color:colors.textMuted, fontSize:11 }}>{fmtNum(p.view_count)}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function VideoCardItem({ v, i, cardW, cardH }: { v: VideoResult; i: number; cardW: number; cardH: number }) {
    const { colors: c } = useTheme();
    const watched = useVideoProgress(v.id);
    const hasFrac = watched != null && watched >= 0.02 && watched <= 0.97;
    function fmtDur(s: number) {
      const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
      return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
    }
    return (
      <Animated.View entering={FadeIn.delay(i*30).duration(220)}>
        <TouchableOpacity style={{ width:cardW, borderRadius:14, overflow:"hidden", backgroundColor:"#1a1a1d" }} onPress={() => { Haptics.selectionAsync(); router.push({ pathname:"/video/[id]", params:{ id:v.id } } as any); }} activeOpacity={0.82}>
          <View style={{ width:cardW, height:cardH }}>
            {v.image_url
              ? <Image source={{ uri:v.image_url }} style={{ width:cardW, height:cardH }} resizeMode="cover" />
              : <LinearGradient colors={["#1a2a35","#0d1117"]} style={{ width:cardW, height:cardH, alignItems:"center", justifyContent:"center" }}><Ionicons name="videocam" size={28} color="#ffffff40" /></LinearGradient>
            }
            <View style={{ ...StyleSheet.absoluteFillObject, alignItems:"center", justifyContent:"center" }}>
              <View style={{ width:38, height:38, borderRadius:19, backgroundColor:"rgba(0,0,0,0.55)", alignItems:"center", justifyContent:"center", borderWidth:1.5, borderColor:"rgba(255,255,255,0.35)" }}>
                <Ionicons name="play" size={16} color="#fff" style={{ marginLeft:2 }} />
              </View>
            </View>
            <View style={{ position:"absolute", top:6, right:6, flexDirection:"row", alignItems:"center", gap:3, backgroundColor:"rgba(0,0,0,0.62)", borderRadius:8, paddingHorizontal:6, paddingVertical:2 }}>
              <Ionicons name="eye-outline" size={10} color="#fff" />
              <Text style={{ color:"#fff", fontSize:10, fontFamily:"Inter_500Medium" }}>{fmtNum(v.view_count)}</Text>
            </View>
            {v.duration_seconds!=null && v.duration_seconds>0 && (
              <View style={{ position:"absolute", bottom:6, right:6, backgroundColor:"rgba(0,0,0,0.75)", borderRadius:4, paddingHorizontal:5, paddingVertical:2 }}>
                <Text style={{ color:"#fff", fontSize:11, fontFamily:"Inter_600SemiBold" }}>{fmtDur(v.duration_seconds)}</Text>
              </View>
            )}
            {hasFrac && (
              <View style={{ position:"absolute", bottom:0, left:0, right:0, height:3, backgroundColor:"rgba(255,255,255,0.25)" }}>
                <View style={{ height:3, backgroundColor:"#ff2d55", width:`${Math.round(watched!*100)}%` as any }} />
              </View>
            )}
          </View>
          <View style={{ padding:8, gap:4, backgroundColor:c.surface }}>
            {v.content ? <Text style={{ color:c.text, fontSize:12, fontFamily:"Inter_500Medium" }} numberOfLines={2}>{v.content}</Text> : null}
            <View style={{ flexDirection:"row", alignItems:"center", gap:5 }}>
              {v.author_avatar ? <Image source={{ uri:v.author_avatar }} style={{ width:16, height:16, borderRadius:8 }} /> : <AvatarPlaceholder name={v.author_name} size={16} color={BRAND} />}
              <Text style={{ color:c.textMuted, fontSize:10, fontFamily:"Inter_500Medium", flex:1 }} numberOfLines={1}>{v.author_name}</Text>
              <Text style={{ color:c.textMuted, fontSize:10 }}>{timeAgo(v.created_at)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function VideoGrid({ videos, compact }: { videos: VideoResult[]; compact?: boolean }) {
    const COLS = 2, GAP = 8, HPAD = 16;
    const cardW = Math.floor((SW - HPAD*2 - GAP*(COLS-1))/COLS);
    const cardH = Math.round(cardW*9/16);
    return (
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:GAP, paddingHorizontal:HPAD, paddingBottom:8 }}>
        {videos.map((v,i) => <VideoCardItem key={v.id} v={v} i={i} cardW={cardW} cardH={cardH} />)}
      </View>
    );
  }

  function ChannelCard({ ch, i }: { ch: ChannelResult; i: number }) {
    return (
      <Animated.View entering={FadeInRight.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface }]} onPress={() => router.push(`/chat/${ch.id}` as any)} activeOpacity={0.75}>
          {ch.avatar_url
            ? <Image source={{ uri:ch.avatar_url }} style={[ss.av52, { borderRadius:14 }]} />
            : <LinearGradient colors={[BRAND,"#00ACC1"]} style={[ss.av52, { borderRadius:14, alignItems:"center", justifyContent:"center" }]}><Ionicons name="megaphone" size={24} color="#fff" /></LinearGradient>
          }
          <View style={{ flex:1, gap:3 }}>
            <Text style={[ss.cardTitle, { color:colors.text }]} numberOfLines={1}>{ch.name}</Text>
            {ch.description ? <Text style={[ss.bioText, { color:colors.textSecondary }]} numberOfLines={2}>{ch.description}</Text> : null}
            <View style={{ flexDirection:"row", alignItems:"center", gap:3, marginTop:2 }}>
              <Ionicons name="people" size={12} color={colors.textMuted} />
              <Text style={{ color:colors.textMuted, fontSize:11 }}>{(ch.subscriber_count||0).toLocaleString()} subscribers</Text>
            </View>
          </View>
          <View style={[ss.viewBtn, { backgroundColor:"#AF52DE"+"18" }]}>
            <Text style={{ color:"#AF52DE", fontSize:12, fontFamily:"Inter_600SemiBold" }}>Join</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function EventCard({ ev, i }: { ev: EventResult; i: number }) {
    const isFull = ev.capacity > 0 && ev.tickets_sold >= ev.capacity;
    const pct = ev.capacity > 0 ? Math.min((ev.tickets_sold/ev.capacity)*100, 100) : 0;
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface, flexDirection:"column", gap:10 }]} onPress={() => router.push("/digital-events" as any)} activeOpacity={0.75}>
          <View style={{ flexDirection:"row", gap:12, alignItems:"flex-start" }}>
            <LinearGradient colors={[WARN,"#FFCC00"]} style={[ss.eventEmoji]}>
              <Text style={{ fontSize:26 }}>{ev.emoji}</Text>
            </LinearGradient>
            <View style={{ flex:1, gap:4 }}>
              <Text style={[ss.cardTitle, { color:colors.text }]} numberOfLines={2}>{ev.title}</Text>
              <View style={{ flexDirection:"row", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={{ color:colors.textMuted, fontSize:11 }}>{fmtEventDate(ev.event_date)}</Text>
                {ev.category && <View style={[ss.catPill, { backgroundColor:WARN+"18" }]}><Text style={{ color:WARN, fontSize:10, fontFamily:"Inter_600SemiBold" }}>{ev.category}</Text></View>}
              </View>
              {ev.description ? <Text style={[ss.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{ev.description}</Text> : null}
            </View>
            <View>
              {ev.price === 0
                ? <View style={ss.freeBadge}><Text style={ss.freeBadgeText}>FREE</Text></View>
                : <View style={{ backgroundColor:GOLD+"18", paddingHorizontal:8, paddingVertical:3, borderRadius:8 }}><Text style={{ color:GOLD, fontSize:13, fontFamily:"Inter_700Bold" }}>{ev.price} AC</Text></View>
              }
            </View>
          </View>
          {ev.capacity > 0 && (
            <View style={{ gap:4 }}>
              <View style={{ flexDirection:"row", justifyContent:"space-between" }}>
                <Text style={{ color:colors.textMuted, fontSize:11 }}>{ev.tickets_sold.toLocaleString()}/{ev.capacity.toLocaleString()} tickets</Text>
                {isFull
                  ? <Text style={{ color:"#EF4444", fontSize:11, fontFamily:"Inter_600SemiBold" }}>SOLD OUT</Text>
                  : <Text style={{ color:colors.textMuted, fontSize:11 }}>{Math.round(pct)}% filled</Text>
                }
              </View>
              <View style={[ss.progressBg, { backgroundColor:colors.backgroundSecondary }]}>
                <View style={[ss.progressFill, { width:`${pct}%` as any, backgroundColor:pct>=90?"#EF4444":WARN }]} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function GiftGrid({ gifts }: { gifts: GiftResult[] }) {
    const cols = 4;
    const cardW = Math.floor((SW - 48 - (cols-1)*8) / cols);
    return (
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, paddingHorizontal:16, paddingBottom:8 }}>
        {gifts.map((g,i) => {
          const rc = RARITY_COLORS[g.rarity]||"#888";
          return (
            <Animated.View key={g.id} entering={FadeIn.delay(i*20).duration(200)}>
              <TouchableOpacity style={[ss.giftCard, { backgroundColor:colors.surface, borderColor:rc+"44", width:cardW }]} onPress={() => router.push("/gifts" as any)} activeOpacity={0.75}>
                <Text style={{ fontSize:28 }}>{g.emoji}</Text>
                <Text style={{ color:colors.text, fontSize:11, fontFamily:"Inter_500Medium", textAlign:"center" }} numberOfLines={1}>{g.name}</Text>
                <View style={{ flexDirection:"row", alignItems:"center", gap:2 }}>
                  <Ionicons name="diamond" size={10} color={GOLD} />
                  <Text style={{ color:GOLD, fontSize:11, fontFamily:"Inter_700Bold" }}>{g.base_xp_cost}</Text>
                </View>
                <View style={{ width:6, height:6, borderRadius:3, backgroundColor:rc }} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  }

  function MarketCard({ s, i }: { s: MarketResult; i: number }) {
    const kindColor = s.kind==="product" ? "#AF52DE" : s.kind==="freelance" ? SUCCESS : "#007AFF";
    const kindGrad: [string,string] = s.kind==="product" ? ["#AF52DE","#BF5AF2"] : s.kind==="freelance" ? [SUCCESS,"#30D158"] : ["#007AFF","#0A84FF"];
    const kindLabel = s.kind==="product" ? "Product" : s.kind==="freelance" ? "Freelance" : "Community";
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface }]} onPress={() => router.push(s.route as any)} activeOpacity={0.75}>
          {s.image_url
            ? <Image source={{ uri:s.image_url }} style={[ss.av52, { borderRadius:14 }]} resizeMode="cover" />
            : <LinearGradient colors={kindGrad} style={[ss.av52, { borderRadius:14, alignItems:"center", justifyContent:"center" }]}><Text style={{ fontSize:24 }}>{s.emoji||"📦"}</Text></LinearGradient>
          }
          <View style={{ flex:1, gap:3 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
              <Text style={[ss.cardTitle, { color:colors.text }]} numberOfLines={1}>{s.title}</Text>
              <View style={{ backgroundColor:kindColor+"18", paddingHorizontal:6, paddingVertical:2, borderRadius:6 }}>
                <Text style={{ color:kindColor, fontSize:10, fontFamily:"Inter_600SemiBold" }}>{kindLabel}</Text>
              </View>
            </View>
            {s.desc ? <Text style={[ss.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{s.desc}</Text> : null}
            {s.seller_name ? <Text style={{ color:colors.textMuted, fontSize:11 }}>by {s.seller_name}</Text> : null}
          </View>
          <View style={{ alignItems:"flex-end", gap:5 }}>
            <View style={{ backgroundColor:kindColor+"18", paddingHorizontal:8, paddingVertical:4, borderRadius:10 }}>
              <Text style={{ color:kindColor, fontSize:13, fontFamily:"Inter_700Bold" }}>{s.price} AC</Text>
            </View>
            {s.badge ? <Text style={{ color:colors.textMuted, fontSize:10 }}>{s.badge}</Text> : null}
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function JobCard({ j, i }: { j: JobResult; i: number }) {
    const jobTypeColor = j.job_type?.toLowerCase().includes("remote") ? SUCCESS
      : j.job_type?.toLowerCase().includes("full") ? "#007AFF"
      : j.job_type?.toLowerCase().includes("part") ? WARN : BRAND;

    function onApply() {
      Haptics.selectionAsync();
      if (j.apply_url) Linking.openURL(j.apply_url).catch(() => {});
      else if (j.company_slug) router.push(`/company/${j.company_slug}` as any);
    }

    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[ss.card, { backgroundColor:colors.surface, flexDirection:"column", gap:10 }]} onPress={onApply} activeOpacity={0.75}>
          <View style={{ flexDirection:"row", alignItems:"flex-start", gap:12 }}>
            {j.company_logo
              ? <Image source={{ uri:j.company_logo }} style={[ss.av48, { borderRadius:12 }]} />
              : <LinearGradient colors={[SUCCESS,"#30D158"]} style={[ss.av48, { borderRadius:12, alignItems:"center", justifyContent:"center" }]}><Ionicons name="business" size={24} color="#fff" /></LinearGradient>
            }
            <View style={{ flex:1, gap:3 }}>
              <Text style={[ss.cardTitle, { color:colors.text }]} numberOfLines={2}>{j.title}</Text>
              <Text style={{ color:colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium" }}>{j.company_name}</Text>
              <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginTop:4 }}>
                {j.job_type && (
                  <View style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:jobTypeColor+"18", paddingHorizontal:8, paddingVertical:3, borderRadius:8 }}>
                    <Ionicons name="briefcase-outline" size={11} color={jobTypeColor} />
                    <Text style={{ color:jobTypeColor, fontSize:11, fontFamily:"Inter_600SemiBold" }}>{j.job_type}</Text>
                  </View>
                )}
                {j.location && (
                  <View style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:colors.backgroundSecondary, paddingHorizontal:8, paddingVertical:3, borderRadius:8 }}>
                    <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                    <Text style={{ color:colors.textMuted, fontSize:11 }}>{j.location}</Text>
                  </View>
                )}
                <View style={{ flexDirection:"row", alignItems:"center", gap:4, backgroundColor:colors.backgroundSecondary, paddingHorizontal:8, paddingVertical:3, borderRadius:8 }}>
                  <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                  <Text style={{ color:colors.textMuted, fontSize:11 }}>{timeAgo(j.created_at)}</Text>
                </View>
              </View>
            </View>
          </View>
          {j.description ? (
            <Text style={{ color:colors.textSecondary, fontSize:13, lineHeight:19 }} numberOfLines={2}>{j.description}</Text>
          ) : null}
          <View style={{ flexDirection:"row", justifyContent:"flex-end" }}>
            <View style={{ backgroundColor:SUCCESS, paddingHorizontal:16, paddingVertical:8, borderRadius:10, flexDirection:"row", alignItems:"center", gap:5 }}>
              <Ionicons name="open-outline" size={13} color="#fff" />
              <Text style={{ color:"#fff", fontSize:13, fontFamily:"Inter_600SemiBold" }}>Apply Now</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function SectionLabel({ icon, label, count, onSeeAll, color }: { icon:string; label:string; count:number; onSeeAll?:()=>void; color?:string }) {
    if (count === 0) return null;
    const c = color || BRAND;
    return (
      <View style={[ss.sectionLabel, { marginTop:4 }]}>
        <View style={[ss.sectionIconWrap, { backgroundColor:c+"18" }]}>
          <Ionicons name={icon as any} size={13} color={c} />
        </View>
        <Text style={[ss.sectionLabelText, { color:colors.text }]}>{label}</Text>
        <View style={[ss.countPill, { backgroundColor:c+"18" }]}>
          <Text style={{ color:c, fontSize:11, fontFamily:"Inter_700Bold" }}>{count}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity style={ss.seeAllBtn} onPress={onSeeAll}>
            <Text style={{ color:c, fontSize:12, fontFamily:"Inter_600SemiBold" }}>See all</Text>
            <Ionicons name="chevron-forward" size={12} color={c} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Render results ───────────────────────────────────────────────────────────

  function renderResults() {
    const showPeople   = (tab==="all"||tab==="people")   && results.people.length>0;
    const showPosts    = (tab==="all"||tab==="posts")    && results.posts.length>0;
    const showVideos   = (tab==="all"||tab==="videos")   && results.videos.length>0;
    const showChannels = (tab==="all"||tab==="channels") && results.channels.length>0;
    const showEvents   = (tab==="all"||tab==="events")   && results.events.length>0;
    const showGifts    = (tab==="all"||tab==="gifts")    && results.gifts.length>0;
    const showMarket   = (tab==="all"||tab==="market")   && results.market.length>0;
    const showJobs     = (tab==="all"||tab==="jobs")     && results.jobs.length>0;
    const anyResults = showPeople||showPosts||showVideos||showChannels||showEvents||showGifts||showMarket||showJobs;

    if (!anyResults) {
      return (
        <ScrollView contentContainerStyle={{ flexGrow:1, alignItems:"center", justifyContent:"center", paddingBottom:scrollPB+32 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(320)} style={{ alignItems:"center", paddingHorizontal:32, width:"100%" }}>
            <LinearGradient colors={[BRAND+"28",BRAND+"08"]} style={{ width:96, height:96, borderRadius:48, alignItems:"center", justifyContent:"center", marginBottom:20 }}>
              <Ionicons name="search-outline" size={44} color={BRAND} />
            </LinearGradient>
            <Text style={{ fontSize:20, fontFamily:"Inter_700Bold", color:colors.text, textAlign:"center" }}>Nothing found</Text>
            <Text style={{ fontSize:14, fontFamily:"Inter_400Regular", color:colors.textSecondary, textAlign:"center", marginTop:6, marginBottom:20, lineHeight:20 }}>
              No results for <Text style={{ fontFamily:"Inter_600SemiBold", color:colors.text }}>"{query.trim()}"</Text>
              {"\n"}Try different keywords or a different tab.
            </Text>
            {aiMode && aiInsight && (
              <View style={{ width:"100%", marginBottom:16 }}>
                <AiInsightCard />
              </View>
            )}
            <View style={{ width:"100%", borderRadius:16, padding:16, gap:12, backgroundColor:colors.surface }}>
              <Text style={{ color:colors.textMuted, fontSize:12, fontFamily:"Inter_600SemiBold", letterSpacing:0.5, textTransform:"uppercase" }}>Trending Topics</Text>
              <View style={ss.tagsWrap}>
                {(trendingHashtags.length>0 ? trendingHashtags.slice(0,8) : TRENDING_TAGS.slice(0,8).map(t=>({ tag:t, count:0 }))).map(({ tag }) => (
                  <TouchableOpacity key={tag} style={[ss.tagChip, { backgroundColor:BRAND+"12", borderColor:BRAND+"25" }]} onPress={() => onTagPress(tag)} activeOpacity={0.7}>
                    <Text style={{ color:BRAND, fontSize:13, fontFamily:"Inter_700Bold" }}>#</Text>
                    <Text style={{ color:BRAND, fontSize:13, fontFamily:"Inter_500Medium" }}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      );
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom:scrollPB }}>
        {/* Results banner */}
        <Animated.View entering={FadeInDown.duration(200)} style={[ss.resultsBanner, { backgroundColor:colors.surface, borderBottomColor:colors.border }]}>
          <Ionicons name="search" size={14} color={BRAND} />
          <Text style={{ color:colors.textSecondary, fontSize:13, fontFamily:"Inter_400Regular", flex:1 }}>
            <Text style={{ fontFamily:"Inter_600SemiBold", color:colors.text }}>{totalCount}</Text>{" "}results for{" "}
            <Text style={{ fontFamily:"Inter_600SemiBold", color:BRAND }}>"{query.trim()}"</Text>
          </Text>
        </Animated.View>

        {/* AI Insight Card */}
        {aiMode && (aiInsight || aiLoading) && (
          <View style={{ paddingHorizontal:16, paddingTop:14 }}>
            <AiInsightCard />
          </View>
        )}

        {showPeople && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="people" label="People & Organizations" count={results.people.length} onSeeAll={tab==="all"&&results.people.length>=5?()=>onTabPress("people"):undefined} />
            {results.people.map((p,i) => <PersonCard key={`${(p as any).kind}-${p.id}`} p={p} i={i} />)}
          </View>
        )}
        {showPosts && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="document-text" label="Posts & Articles" count={results.posts.length} onSeeAll={tab==="all"&&results.posts.length>=5?()=>onTabPress("posts"):undefined} />
            {results.posts.map((p,i) => <PostCard key={p.id} p={p} i={i} />)}
          </View>
        )}
        {showVideos && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="play-circle" label="Videos" count={results.videos.length} onSeeAll={tab==="all"&&results.videos.length>=4?()=>onTabPress("videos"):undefined} color="#FF3B30" />
            <VideoGrid videos={tab==="all"?results.videos.slice(0,4):results.videos} compact={tab==="all"} />
          </View>
        )}
        {showJobs && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="briefcase" label="Jobs & Opportunities" count={results.jobs.length} onSeeAll={tab==="all"&&results.jobs.length>=4?()=>onTabPress("jobs"):undefined} color={SUCCESS} />
            {results.jobs.map((j,i) => <JobCard key={j.id} j={j} i={i} />)}
          </View>
        )}
        {showChannels && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="megaphone" label="Channels" count={results.channels.length} onSeeAll={tab==="all"&&results.channels.length>=4?()=>onTabPress("channels"):undefined} color="#AF52DE" />
            {results.channels.map((ch,i) => <ChannelCard key={ch.id} ch={ch} i={i} />)}
          </View>
        )}
        {showEvents && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="calendar" label="Events" count={results.events.length} onSeeAll={tab==="all"&&results.events.length>=3?()=>onTabPress("events"):undefined} color={WARN} />
            {results.events.map((ev,i) => <EventCard key={ev.id} ev={ev} i={i} />)}
          </View>
        )}
        {showGifts && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="gift" label="Gifts" count={results.gifts.length} onSeeAll={tab==="all"&&results.gifts.length>=6?()=>onTabPress("gifts"):undefined} color={GOLD} />
            <GiftGrid gifts={results.gifts} />
          </View>
        )}
        {showMarket && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="storefront" label="Marketplace" count={results.market.length} onSeeAll={tab==="all"&&results.market.length>=5?()=>onTabPress("market"):undefined} color="#AF52DE" />
            {results.market.map((s,i) => <MarketCard key={`${s.kind}-${s.id}`} s={s} i={i} />)}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Render idle ──────────────────────────────────────────────────────────────

  function renderIdle() {
    const QCOLS = 4, QGAP = 10;
    const quickCardW = Math.floor((SW - 32 - QGAP*(QCOLS-1))/QCOLS);
    return (
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:scrollPB }}>

        {/* Browse Categories */}
        <View style={{ paddingHorizontal:16, paddingTop:20 }}>
          <View style={[ss.idleSectionRow, { marginBottom:0 }]}>
            <Ionicons name="compass" size={16} color={BRAND} />
            <Text style={[ss.idleHeading, { color:colors.text }]}>Browse Categories</Text>
          </View>
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:QGAP, marginTop:14 }}>
            {QUICK_CATEGORIES.map((qc,i) => (
              <Animated.View key={qc.id} entering={FadeInDown.delay(i*30).duration(200)}>
                <TouchableOpacity
                  style={{ width:quickCardW, alignItems:"center", borderRadius:18, paddingVertical:16, paddingHorizontal:6, gap:10, backgroundColor:colors.surface, shadowColor:"#000", shadowOffset:{ width:0,height:2 }, shadowOpacity:0.06, shadowRadius:8, elevation:3 }}
                  onPress={() => {
                    if (qc.route) { router.push(qc.route as any); return; }
                    const t = qc.id as SearchTab;
                    setTab(t); inputRef.current?.focus();
                    if (t === "videos" || t === "jobs") performSearch("", t, false, "popular", "all");
                  }}
                  activeOpacity={0.78}
                >
                  <LinearGradient colors={qc.gradient} style={{ width:50, height:50, borderRadius:16, alignItems:"center", justifyContent:"center" }} start={{ x:0,y:0 }} end={{ x:1,y:1 }}>
                    <Ionicons name={qc.icon as any} size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={{ fontSize:12, fontFamily:"Inter_600SemiBold", textAlign:"center", color:colors.text }}>{qc.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Trending People */}
        {trendingPeople.length > 0 && (
          <View style={{ paddingTop:28 }}>
            <View style={[ss.idleSectionRow, { paddingHorizontal:16, marginBottom:12 }]}>
              <Ionicons name="trending-up" size={16} color={BRAND} />
              <Text style={[ss.idleHeading, { color:colors.text }]}>Trending People</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:10, paddingHorizontal:16, paddingBottom:4 }}>
              {trendingPeople.map((p,i) => (
                <Animated.View key={p.id} entering={FadeInRight.delay(i*30).duration(200)}>
                  <TouchableOpacity style={[ss.personChip, { backgroundColor:colors.surface }]} onPress={() => router.push(`/contact/${p.id}` as any)} activeOpacity={0.78}>
                    <View style={{ position:"relative" }}>
                      {p.avatar_url
                        ? <Image source={{ uri:p.avatar_url }} style={ss.personChipAv} />
                        : <AvatarPlaceholder name={p.display_name} size={44} color={BRAND} />}
                      {p.is_verified && <View style={ss.orgDot}><Ionicons name="checkmark-circle" size={13} color={p.is_organization_verified ? GOLD : BRAND} /></View>}
                    </View>
                    <Text style={[ss.personChipName, { color:colors.text }]} numberOfLines={1}>{p.display_name}</Text>
                    <Text style={{ color:colors.textMuted, fontSize:10 }}>@{p.handle}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending Videos */}
        {trendingVideos.length > 0 && (
          <View style={{ paddingTop:28 }}>
            <View style={[ss.idleSectionRow, { paddingHorizontal:16, marginBottom:12 }]}>
              <Ionicons name="flame" size={16} color="#FF3B30" />
              <Text style={[ss.idleHeading, { color:colors.text }]}>Trending Videos</Text>
              <TouchableOpacity style={{ marginLeft:"auto" as any }} onPress={() => { setTab("videos"); performSearch("", "videos", false, "popular", "all"); }}>
                <Text style={{ color:BRAND, fontSize:12, fontFamily:"Inter_600SemiBold" }}>See all</Text>
              </TouchableOpacity>
            </View>
            <VideoGrid videos={trendingVideos} />
          </View>
        )}

        {/* Trending Topics */}
        <View style={{ paddingHorizontal:16, paddingTop:28 }}>
          <View style={[ss.idleSectionRow, { marginBottom:14 }]}>
            <Ionicons name="pricetag" size={16} color="#AF52DE" />
            <Text style={[ss.idleHeading, { color:colors.text }]}>Trending Topics</Text>
          </View>
          <View style={ss.tagsWrap}>
            {(trendingHashtags.length>0 ? trendingHashtags : TRENDING_TAGS.map(t=>({ tag:t, count:0 }))).map(({ tag, count },i) => (
              <Animated.View key={tag} entering={FadeIn.delay(i*20).duration(180)}>
                <TouchableOpacity style={[ss.tagChip, { backgroundColor:"#AF52DE"+"12", borderColor:"#AF52DE"+"28" }]} onPress={() => onTagPress(tag)} activeOpacity={0.75}>
                  <Text style={{ color:"#AF52DE", fontSize:13, fontFamily:"Inter_700Bold" }}>#</Text>
                  <Text style={{ color:"#AF52DE", fontSize:13, fontFamily:"Inter_500Medium" }}>{tag}</Text>
                  {count > 1 && (
                    <View style={{ backgroundColor:"#AF52DE"+"20", borderRadius:8, paddingHorizontal:5, paddingVertical:1, marginLeft:2 }}>
                      <Text style={{ color:"#AF52DE", fontSize:10, fontFamily:"Inter_600SemiBold" }}>{count>99?"99+":count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Recent searches */}
        {history.length > 0 && (
          <View style={{ paddingHorizontal:16, paddingTop:24 }}>
            <View style={[ss.idleSectionRow, { marginBottom:12 }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[ss.idleHeading, { color:colors.text }]}>Recent Searches</Text>
              <TouchableOpacity style={{ marginLeft:"auto" as any }} onPress={() => clearHistory().then(()=>setHistory([]))}>
                <Text style={{ color:colors.textMuted, fontSize:12, fontFamily:"Inter_500Medium" }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {history.slice(0,8).map((term,i) => (
              <TouchableOpacity key={`h-${i}`} style={[ss.histRow, { backgroundColor:colors.surface, borderColor:colors.border }]} onPress={() => onHistoryPress(term)} activeOpacity={0.75}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text style={{ flex:1, fontSize:14, fontFamily:"Inter_400Regular", color:colors.text }}>{term}</Text>
                <TouchableOpacity hitSlop={{ top:8, bottom:8, left:8, right:8 }} onPress={() => removeFromHistory(term).then(setHistory)}>
                  <Ionicons name="close" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Saved searches */}
        {saved.length > 0 && (
          <View style={{ paddingHorizontal:16, paddingTop:24 }}>
            <View style={[ss.idleSectionRow, { marginBottom:12 }]}>
              <Ionicons name="bookmark-outline" size={16} color={GOLD} />
              <Text style={[ss.idleHeading, { color:colors.text }]}>Saved Searches</Text>
            </View>
            {saved.slice(0,5).map((s) => (
              <TouchableOpacity key={s.id} style={[ss.histRow, { backgroundColor:colors.surface, borderColor:colors.border }]} onPress={() => onHistoryPress(s.query)} activeOpacity={0.75}>
                <Ionicons name="bookmark" size={14} color={GOLD} />
                <Text style={{ flex:1, fontSize:14, fontFamily:"Inter_400Regular", color:colors.text }}>{s.query}</Text>
                <TouchableOpacity hitSlop={{ top:8, bottom:8, left:8, right:8 }} onPress={() => removeSavedSearch(s.id).then(setSaved)}>
                  <Ionicons name="close" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <View style={[ss.root, { backgroundColor:colors.backgroundSecondary }]}>

      {/* ── Header ── */}
      <View style={[ss.header, { paddingTop: isDesktop ? 12 : insets.top+8, backgroundColor:colors.surface, borderBottomColor:colors.border, zIndex:20, overflow:"visible" as any }]}>
        {!isDesktop && <Text style={[ss.headerTitle, { color:colors.text }]}>Search</Text>}

        {/* Search bar */}
        {!isDesktop && (
          <View style={[ss.searchBar, { backgroundColor:colors.inputBg, borderColor: query.length>0 ? BRAND+"55" : colors.border }]}>
            <Ionicons name="search" size={18} color={query.length>0 ? BRAND : colors.textMuted} style={{ marginRight:2 }} />
            <TextInput
              ref={inputRef}
              style={[ss.searchInput, { color:colors.text }]}
              placeholder="Search people, posts, jobs, videos…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={onChangeText}
              onSubmitEditing={onSubmit}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {/* AI Mode toggle */}
            <TouchableOpacity onPress={toggleAiMode} hitSlop={8} style={[ss.aiToggleBtn, aiMode && { backgroundColor:PURPLE+"22", borderColor:PURPLE+"55" }]}>
              <Ionicons name="sparkles" size={16} color={aiMode ? PURPLE : colors.textMuted} />
            </TouchableOpacity>
            {query.length > 0
              ? <TouchableOpacity onPress={clearSearch} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              : Platform.OS === "web"
                ? <TouchableOpacity onPress={startVoice} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
                    <Ionicons name={isListening ? "mic" : "mic-outline"} size={18} color={isListening ? MATCH : colors.textMuted} />
                  </TouchableOpacity>
                : null
            }
          </View>
        )}

        {/* Filter / sort / date row */}
        <View style={{ paddingHorizontal:16, paddingVertical:8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6 }}>
            {/* Verified */}
            <TouchableOpacity style={[ss.filterPill, verifiedOnly && { backgroundColor:BRAND, borderColor:BRAND }]} onPress={toggleVerified}>
              <Ionicons name="checkmark-circle" size={13} color={verifiedOnly ? "#fff" : colors.textMuted} />
              <Text style={{ color:verifiedOnly ? "#fff" : colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium" }}>Verified</Text>
            </TouchableOpacity>

            {/* Sort */}
            {(["relevance","recent","popular"] as SortMode[]).map(s => (
              <TouchableOpacity key={s} style={[ss.filterPill, sortMode===s && { backgroundColor:BRAND+"18", borderColor:BRAND+"50" }]} onPress={() => onSortPress(s)}>
                <Ionicons name={s==="relevance"?"flash-outline":s==="recent"?"time-outline":"trending-up-outline"} size={13} color={sortMode===s ? BRAND : colors.textMuted} />
                <Text style={{ color:sortMode===s ? BRAND : colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium", textTransform:"capitalize" }}>{s}</Text>
              </TouchableOpacity>
            ))}

            {/* Date range */}
            {(["all","24h","7d","30d"] as DateRange[]).map(dr => (
              <TouchableOpacity key={dr} style={[ss.filterPill, dateRange===dr && dr!=="all" && { backgroundColor:PURPLE+"18", borderColor:PURPLE+"50" }]} onPress={() => onDateRangePress(dr)}>
                <Ionicons name="calendar-outline" size={13} color={dateRange===dr && dr!=="all" ? PURPLE : colors.textMuted} />
                <Text style={{ color:dateRange===dr && dr!=="all" ? PURPLE : colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium" }}>
                  {dr==="all" ? "Any time" : dr}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Save search */}
            {hasSearched && query.trim().length >= 2 && (
              <TouchableOpacity
                style={[ss.filterPill, saved.some(s=>s.query.toLowerCase()===query.trim().toLowerCase()) && { backgroundColor:GOLD+"18", borderColor:GOLD+"50" }]}
                onPress={() => {
                  const ex = saved.find(s=>s.query.toLowerCase()===query.trim().toLowerCase());
                  if (ex) removeSavedSearch(ex.id).then(setSaved);
                  else saveSearch(query.trim(), tab).then(setSaved);
                }}
              >
                <Ionicons name="bookmark-outline" size={13} color={GOLD} />
                <Text style={{ color:GOLD, fontSize:12, fontFamily:"Inter_500Medium" }}>Save</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Tab pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:12, paddingTop:4, paddingBottom:10, gap:6 }}>
          {TABS.map(t => {
            const active = tab === t.id;
            const cnt = tabCounts[t.id];
            return (
              <TouchableOpacity key={t.id} style={[ss.tabPill, active && { backgroundColor:BRAND }]} onPress={() => onTabPress(t.id)} activeOpacity={0.75}>
                <Ionicons name={t.icon as any} size={13} color={active ? "#fff" : colors.textMuted} />
                <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize:12, fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" }}>{t.label}</Text>
                {hasSearched && cnt > 0 && (
                  <View style={[ss.tabBadge, { backgroundColor: active ? "#ffffff40" : BRAND+"20" }]}>
                    <Text style={{ color: active ? "#fff" : BRAND, fontSize:9, fontFamily:"Inter_700Bold" }}>{cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Suggestions dropdown */}
        {!isDesktop && showSuggest && suggestions.length > 0 && (
          <Animated.View entering={FadeIn.duration(150)} style={[ss.suggestBox, { backgroundColor:colors.surface, borderColor:colors.border }]}>
            {suggestions.map(p => (
              <TouchableOpacity key={p.id} style={ss.suggestRow} onPress={() => { setShowSuggest(false); setQuery(""); Haptics.selectionAsync(); router.push(`/contact/${p.id}` as any); }} activeOpacity={0.75}>
                {p.avatar_url
                  ? <Image source={{ uri:p.avatar_url }} style={{ width:30, height:30, borderRadius:15 }} />
                  : <AvatarPlaceholder name={p.display_name} size={30} color={BRAND} />}
                <View style={{ flex:1 }}>
                  <Text style={{ color:colors.text, fontSize:13, fontFamily:"Inter_500Medium" }} numberOfLines={1}>{p.display_name}</Text>
                  <Text style={{ color:colors.textMuted, fontSize:11 }}>@{p.handle}</Text>
                </View>
                {p.is_verified && <Ionicons name="checkmark-circle" size={14} color={p.is_organization_verified ? GOLD : BRAND} />}
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </View>

      {/* ── Body ── */}
      <View style={{ flex:1 }}>
        {loading
          ? <ScrollView contentContainerStyle={{ paddingTop:16, paddingBottom:scrollPB }} showsVerticalScrollIndicator={false}>{[1,2,3,4,5].map(i=><CardSkeleton key={i} />)}</ScrollView>
          : hasSearched ? renderResults() : renderIdle()
        }
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:             { flex:1 },
  header:           { borderBottomWidth:StyleSheet.hairlineWidth, paddingBottom:0 },
  headerTitle:      { fontSize:22, fontFamily:"Inter_700Bold", paddingHorizontal:16, marginBottom:10 },
  searchBar:        { flexDirection:"row", alignItems:"center", marginHorizontal:16, paddingHorizontal:12, paddingVertical:9, borderRadius:14, gap:8, borderWidth:1 },
  searchInput:      { flex:1, fontSize:15, fontFamily:"Inter_400Regular", padding:0 },
  aiToggleBtn:      { width:30, height:30, borderRadius:10, alignItems:"center", justifyContent:"center", borderWidth:1, borderColor:"transparent" },
  filterPill:       { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:11, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:"rgba(128,128,128,0.2)" },
  tabPill:          { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:12, paddingVertical:7, borderRadius:20 },
  tabBadge:         { borderRadius:8, paddingHorizontal:5, paddingVertical:1, minWidth:16, alignItems:"center" },
  suggestBox:       { position:"absolute", top:"100%" as any, left:16, right:16, zIndex:100, borderRadius:14, borderWidth:StyleSheet.hairlineWidth, shadowColor:"#000", shadowOpacity:0.15, shadowRadius:16, shadowOffset:{ width:0,height:6 }, elevation:16 },
  suggestRow:       { flexDirection:"row", alignItems:"center", gap:10, padding:12 },
  resultsBanner:    { flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:16, paddingVertical:10, borderBottomWidth:StyleSheet.hairlineWidth },
  sectionLabel:     { flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:16, paddingBottom:10 },
  sectionIconWrap:  { width:26, height:26, borderRadius:8, alignItems:"center", justifyContent:"center" },
  sectionLabelText: { fontSize:15, fontFamily:"Inter_700Bold", flex:1 },
  countPill:        { borderRadius:10, paddingHorizontal:8, paddingVertical:3 },
  seeAllBtn:        { flexDirection:"row", alignItems:"center", gap:2, marginLeft:"auto" as any },
  card:             { flexDirection:"row", alignItems:"center", gap:12, marginHorizontal:16, marginBottom:10, padding:14, borderRadius:18, shadowColor:"#000", shadowOffset:{ width:0,height:2 }, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  cardTitle:        { fontSize:15, fontFamily:"Inter_600SemiBold" },
  cardSub:          { fontSize:12, fontFamily:"Inter_400Regular" },
  bioText:          { fontSize:12, fontFamily:"Inter_400Regular", lineHeight:17 },
  av48:             { width:48, height:48, borderRadius:24 },
  av48Wrap:         { position:"relative" },
  orgDot:           { position:"absolute", bottom:-2, right:-2, backgroundColor:"#fff", borderRadius:8 },
  av36:             { width:36, height:36, borderRadius:18 },
  av52:             { width:52, height:52 },
  viewBtn:          { paddingHorizontal:12, paddingVertical:6, borderRadius:10 },
  timeChip:         { paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  giftCard:         { alignItems:"center", borderRadius:16, borderWidth:1, paddingVertical:12, paddingHorizontal:6, gap:4, shadowColor:"#000", shadowOffset:{ width:0,height:1 }, shadowOpacity:0.05, shadowRadius:4, elevation:2 },
  eventEmoji:       { width:54, height:54, borderRadius:16, alignItems:"center", justifyContent:"center" },
  catPill:          { flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  freeBadge:        { backgroundColor:SUCCESS+"22", paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  freeBadgeText:    { color:SUCCESS, fontSize:10, fontFamily:"Inter_700Bold" },
  progressBg:       { height:5, borderRadius:3, overflow:"hidden" },
  progressFill:     { height:5, borderRadius:3 },
  idleHeading:      { fontSize:16, fontFamily:"Inter_700Bold" },
  idleSectionRow:   { flexDirection:"row", alignItems:"center", gap:8 },
  personChip:       { alignItems:"center", borderRadius:18, paddingVertical:14, paddingHorizontal:14, gap:8, width:110, shadowColor:"#000", shadowOffset:{ width:0,height:1 }, shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  personChipAv:     { width:44, height:44, borderRadius:22 },
  personChipName:   { fontSize:12, fontFamily:"Inter_600SemiBold", maxWidth:82, textAlign:"center" },
  tagsWrap:         { flexDirection:"row", flexWrap:"wrap", gap:8 },
  tagChip:          { flexDirection:"row", alignItems:"center", gap:2, paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1 },
  histRow:          { flexDirection:"row", alignItems:"center", gap:10, padding:13, borderRadius:14, borderWidth:StyleSheet.hairlineWidth, marginBottom:6 },
  aiCard:           { borderRadius:18, borderWidth:1, padding:16, marginBottom:4 },
  aiIconWrap:       { width:28, height:28, borderRadius:9, alignItems:"center", justifyContent:"center" },
  aiSuggestChip:    { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:11, paddingVertical:5, borderRadius:16, borderWidth:1, backgroundColor:"transparent" },
});
