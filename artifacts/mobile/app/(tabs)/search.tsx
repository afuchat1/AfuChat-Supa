import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  ScrollView,
  SectionList,
  Share,
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
import { router } from "expo-router";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { supabase } from "@/lib/supabase";
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

const BRAND = "#00BCD4";
const MATCH = "#FF2D55";
const GOLD = "#D4A853";
const SUCCESS = "#34C759";

type SearchTab = "all" | "people" | "posts" | "channels" | "events" | "gifts" | "apps" | "shops";

const TABS: { id: SearchTab; label: string; icon: string }[] = [
  { id: "all",      label: "All",      icon: "apps-outline" },
  { id: "people",   label: "People",   icon: "people-outline" },
  { id: "posts",    label: "Posts",    icon: "document-text-outline" },
  { id: "channels", label: "Channels", icon: "megaphone-outline" },
  { id: "events",   label: "Events",   icon: "calendar-outline" },
  { id: "gifts",    label: "Gifts",    icon: "gift-outline" },
  { id: "shops",    label: "Shops",    icon: "storefront-outline" },
  { id: "apps",     label: "Apps",     icon: "grid-outline" },
];

const RARITY_COLORS: Record<string, string> = {
  common:    "#9E9E9E",
  uncommon:  "#00BCD4",
  rare:      "#2979FF",
  epic:      "#CE93D8",
  legendary: "#FFB74D",
};

const PLATFORM_APPS = [
  { id: "afuai",        label: "AfuAI",          desc: "Your intelligent assistant. Ask anything.",          icon: "sparkles" as const,         gradient: ["#00BCD4","#0097A7"] as [string,string], route: "/ai",             category: "Intelligence" },
  { id: "wallet",       label: "Wallet",          desc: "Send, receive and manage your ACoins & Nexa.",       icon: "wallet" as const,           gradient: ["#00BCD4","#26C6DA"] as [string,string], route: "/wallet",         category: "Finance" },
  { id: "services",     label: "Services",        desc: "Pay bills, top up, and access local services.",      icon: "card" as const,             gradient: ["#AF52DE","#BF5AF2"] as [string,string], route: "/mini-programs",  category: "Finance" },
  { id: "freelance",    label: "Freelance",       desc: "Hire talent or find work on AfuFreelance.",          icon: "briefcase" as const,        gradient: ["#34C759","#30D158"] as [string,string], route: "/freelance",      category: "Finance" },
  { id: "games",        label: "Games",           desc: "Play mini games and win ACoins.",                    icon: "game-controller" as const,  gradient: ["#007AFF","#0A84FF"] as [string,string], route: "/games",          category: "Entertainment" },
  { id: "gifts",        label: "Gifts",           desc: "Send animated gifts to people you love.",            icon: "gift" as const,             gradient: ["#FF3B30","#FF453A"] as [string,string], route: "/gifts",          category: "Entertainment" },
  { id: "shop",         label: "Marketplace",     desc: "Shop from verified organization stores.",            icon: "storefront" as const,       gradient: ["#AF52DE","#BF5AF2"] as [string,string], route: "/store",          category: "Entertainment" },
  { id: "files",        label: "Files",           desc: "Store and share your files securely.",               icon: "folder" as const,           gradient: ["#5856D6","#6E6CD3"] as [string,string], route: "/file-manager",   category: "Tools" },
  { id: "digitalid",    label: "Digital ID",      desc: "Your verifiable 3D digital identity card.",          icon: "id-card" as const,          gradient: ["#1E3A5F","#2C5282"] as [string,string], route: "/digital-id",     category: "Tools" },
  { id: "saved",        label: "Saved Posts",     desc: "All your bookmarked posts in one place.",            icon: "bookmark" as const,         gradient: ["#FF6B35","#FF8C00"] as [string,string], route: "/saved-posts",    category: "Tools" },
  { id: "collections",  label: "Collections",     desc: "Curate and share themed collections.",               icon: "albums" as const,           gradient: ["#BF5AF2","#AF52DE"] as [string,string], route: "/collections",    category: "Tools" },
  { id: "match",        label: "AfuMatch",        desc: "Meet new people and find meaningful connections.",   icon: "heart" as const,            gradient: ["#FF2D55","#FF375F"] as [string,string], route: "/match",          category: "Community" },
  { id: "events",       label: "Events",          desc: "Discover local and online events near you.",         icon: "calendar" as const,         gradient: ["#FF9500","#FFCC00"] as [string,string], route: "/digital-events", category: "Community" },
  { id: "referral",     label: "Referral",        desc: "Invite friends and earn Nexa rewards.",              icon: "people" as const,           gradient: ["#34C759","#00C781"] as [string,string], route: "/referral",       category: "Community" },
  { id: "usernames",    label: "Usernames",       desc: "Buy and sell premium @handles.",                     icon: "at" as const,               gradient: ["#007AFF","#5AC8FA"] as [string,string], route: "/username-market",category: "Community" },
  { id: "prestige",     label: "Prestige",        desc: "Your reputation and rank on AfuChat.",               icon: "trophy" as const,           gradient: ["#D4A853","#F5C842"] as [string,string], route: "/prestige",       category: "Community" },
  { id: "premium",      label: "Premium",         desc: "Unlock exclusive features and perks.",               icon: "star" as const,             gradient: ["#FF9500","#FF6B00"] as [string,string], route: "/premium",        category: "Community" },
  { id: "snake",        label: "Snake",           desc: "Classic snake game. Eat dots, grow, survive.",       icon: "game-controller" as const,  gradient: ["#34C759","#30D158"] as [string,string], route: "/games/snake",    category: "Games" },
  { id: "tetris",       label: "Tetris",          desc: "Stack falling blocks to clear lines.",               icon: "game-controller" as const,  gradient: ["#007AFF","#0A84FF"] as [string,string], route: "/games/tetris",   category: "Games" },
  { id: "minesweeper",  label: "Minesweeper",     desc: "Clear the board without hitting a mine.",            icon: "game-controller" as const,  gradient: ["#FF9500","#FFCC00"] as [string,string], route: "/games/minesweeper",category: "Games" },
  { id: "2048",         label: "2048",            desc: "Merge tiles to reach 2048.",                         icon: "game-controller" as const,  gradient: ["#AF52DE","#BF5AF2"] as [string,string], route: "/games/game-2048",category: "Games" },
  { id: "flappy",       label: "Flappy Bird",     desc: "Fly through the pipes without crashing.",            icon: "game-controller" as const,  gradient: ["#FF3B30","#FF453A"] as [string,string], route: "/games/flappy",   category: "Games" },
  { id: "space",        label: "Space Shooter",   desc: "Blast enemies in deep space.",                       icon: "game-controller" as const,  gradient: ["#1E3A5F","#2C5282"] as [string,string], route: "/games/space-shooter",category: "Games" },
  { id: "memory",       label: "Memory Match",    desc: "Test your memory with card matching.",               icon: "game-controller" as const,  gradient: ["#5856D6","#6E6CD3"] as [string,string], route: "/games/memory-match",category: "Games" },
  { id: "brickbreak",   label: "Brick Breaker",   desc: "Break all the bricks before time runs out.",         icon: "game-controller" as const,  gradient: ["#FF2D55","#FF375F"] as [string,string], route: "/games/brick-breaker",category: "Games" },
];

const QUICK_CATEGORIES = [
  { id: "people",   label: "People",   icon: "people",        gradient: [BRAND, "#0097A7"],       route: null },
  { id: "posts",    label: "Posts",    icon: "document-text", gradient: ["#007AFF", "#0A84FF"],   route: null },
  { id: "channels", label: "Channels", icon: "megaphone",     gradient: ["#AF52DE", "#BF5AF2"],   route: null },
  { id: "events",   label: "Events",   icon: "calendar",      gradient: ["#FF9500", "#FFCC00"],   route: "/digital-events" },
  { id: "gifts",    label: "Gifts",    icon: "gift",          gradient: ["#FF3B30", "#FF453A"],   route: "/gifts" },
  { id: "shops",    label: "Market",   icon: "storefront",    gradient: ["#34C759", "#30D158"],   route: "/store" },
  { id: "match",    label: "AfuMatch", icon: "heart",         gradient: [MATCH, "#FF375F"],       route: "/match" },
  { id: "apps",     label: "All Apps", icon: "grid",          gradient: ["#5856D6", "#6E6CD3"],   route: "/apps" },
];

const TRENDING_TAGS = ["gaming","photography","music","travel","coding","fitness","cooking","art","fashion","tech","crypto","design","startup","afuchat","movies"];

type PersonResult   = { id:string; handle:string; display_name:string; avatar_url:string|null; bio:string|null; is_verified:boolean; is_organization_verified:boolean; current_grade:string; country:string|null; xp?:number };
type PostResult     = { id:string; content:string; image_url:string|null; author_id:string; author_handle:string; author_name:string; author_avatar:string|null; view_count:number; created_at:string };
type ChannelResult  = { id:string; name:string; description:string|null; avatar_url:string|null; subscriber_count:number };
type EventResult    = { id:string; title:string; description:string|null; emoji:string; price:number; event_date:string; capacity:number; tickets_sold:number; category:string|null; creator_name:string; creator_handle:string };
type GiftResult     = { id:string; name:string; emoji:string; base_xp_cost:number; rarity:string; description:string|null };
type ShopResult     = { id:string; kind:"product"|"freelance"|"community"; title:string; desc:string|null; emoji:string|null; image_url:string|null; price:number; badge:string|null; seller_name:string; route:string };
type AppResult      = typeof PLATFORM_APPS[number];

type AllResults = {
  people:   PersonResult[];
  posts:    PostResult[];
  channels: ChannelResult[];
  events:   EventResult[];
  gifts:    GiftResult[];
  shops:    ShopResult[];
  apps:     AppResult[];
};

const EMPTY: AllResults = { people:[], posts:[], channels:[], events:[], gifts:[], shops:[], apps:[] };

function timeAgo(iso:string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h`;
  const d = Math.floor(h/24); if (d < 30) return `${d}d`;
  return `${Math.floor(d/30)}mo`;
}

function formatEventDate(iso:string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

function highlightText(text: string, query: string, baseColor: string, highlightColor: string) {
  if (!query || query.length < 2) return <Text style={{ color: baseColor }}>{text}</Text>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <Text style={{ color: baseColor }}>{text}</Text>;
  return (
    <Text style={{ color: baseColor }}>
      {text.slice(0, idx)}
      <Text style={{ color: highlightColor, fontFamily: "Inter_700Bold" }}>{text.slice(idx, idx + query.length)}</Text>
      {text.slice(idx + query.length)}
    </Text>
  );
}

function AvatarPlaceholder({ name, size, color, style }: { name:string; size:number; color:string; style?:any }) {
  return (
    <View style={[{ width:size, height:size, borderRadius:size/2, alignItems:"center", justifyContent:"center", backgroundColor: color+"22" }, style]}>
      <Text style={{ color, fontSize:size*0.4, fontFamily:"Inter_700Bold" }}>{(name||"?")[0].toUpperCase()}</Text>
    </View>
  );
}

function VerifiedBadge({ verified, org }: { verified:boolean; org:boolean }) {
  if (!verified) return null;
  return <Ionicons name="checkmark-circle" size={13} color={org ? GOLD : BRAND} />;
}

function SkeletonBox({ w, h, r }: { w:number|string; h:number; r:number }) {
  const { colors } = useTheme();
  return <View style={{ width:w as any, height:h, borderRadius:r, backgroundColor: colors.inputBg, opacity:0.7 }} />;
}

function CardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor:colors.surface }]}>
      <SkeletonBox w={44} h={44} r={22} />
      <View style={{ flex:1, gap:6 }}>
        <SkeletonBox w="60%" h={13} r={6} />
        <SkeletonBox w="40%" h={11} r={6} />
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { width: SW } = useWindowDimensions();

  const QUICK_GAP = 10;
  const QUICK_COLS = 4;
  const SIDEBAR_W = 280;
  const RIGHT_W = SW >= 1280 ? 380 : 0;
  const contentW = isDesktop ? SW - SIDEBAR_W - RIGHT_W : SW;
  const quickCardW = Math.floor((contentW - 32 - QUICK_GAP * (QUICK_COLS - 1)) / QUICK_COLS);
  const scrollPB = isDesktop ? 32 : insets.bottom + 52 + 16;

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AllResults>(EMPTY);
  const [hasSearched, setHasSearched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const [history, setHistory] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [trendingPeople, setTrendingPeople] = useState<PersonResult[]>([]);
  const [suggestions, setSuggestions] = useState<PersonResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<"relevance"|"recent"|"popular">("relevance");
  const [showFilters, setShowFilters] = useState(false);

  const [isListening, setIsListening] = useState(false);

  const suggestRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadInitial();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (suggestRef.current) clearTimeout(suggestRef.current);
    };
  }, []);

  async function loadInitial() {
    const [h, s] = await Promise.all([getSearchHistory(), getSavedSearches()]);
    setHistory(h);
    setSaved(s);
    loadTrendingPeople();
  }

  async function loadTrendingPeople() {
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
      .eq("is_verified", true)
      .order("xp", { ascending: false })
      .limit(10);
    if (data) setTrendingPeople(data);
  }

  async function fetchSuggestions(text: string) {
    if (text.length < 2) { setSuggestions([]); setShowSuggest(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, is_verified, is_organization_verified, current_grade, country")
      .or(`handle.ilike.%${text}%,display_name.ilike.%${text}%`)
      .order("xp", { ascending: false })
      .limit(6);
    if (data && data.length > 0) { setSuggestions(data as any); setShowSuggest(true); }
    else { setSuggestions([]); setShowSuggest(false); }
  }

  const searchApps = useCallback((q: string): AppResult[] => {
    if (!q || q.length < 1) return [];
    const lower = q.toLowerCase();
    return PLATFORM_APPS.filter(a =>
      a.label.toLowerCase().includes(lower) ||
      a.desc.toLowerCase().includes(lower) ||
      a.category.toLowerCase().includes(lower)
    ).slice(0, 8);
  }, []);

  const performSearch = useCallback(async (q: string, currentTab: SearchTab, vOnly: boolean, sort: "relevance"|"recent"|"popular") => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults(EMPTY); setHasSearched(false); setTotalCount(0); return;
    }

    const id = ++searchIdRef.current;
    setLoading(true);
    setHasSearched(true);
    const pat = `%${trimmed}%`;
    const all = currentTab === "all";

    try {
      const fetches: Promise<any>[] = [];

      if (all || currentTab === "people") {
        let pq = supabase.from("profiles")
          .select("id, handle, display_name, avatar_url, bio, is_verified, is_organization_verified, current_grade, country, xp")
          .or(`handle.ilike.${pat},display_name.ilike.${pat},bio.ilike.${pat}`);
        if (vOnly) pq = pq.eq("is_verified", true);
        if (sort === "popular") pq = pq.order("xp", { ascending: false });
        fetches.push(pq.limit(all ? 5 : 25));
      } else fetches.push(Promise.resolve({ data: [] }));

      if (all || currentTab === "posts") {
        let pq = supabase.from("posts")
          .select("id, content, image_url, author_id, view_count, created_at")
          .ilike("content", pat);
        if (sort === "recent") pq = pq.order("created_at", { ascending: false });
        else if (sort === "popular") pq = pq.order("view_count", { ascending: false });
        else pq = pq.order("created_at", { ascending: false });
        fetches.push(pq.limit(all ? 5 : 25));
      } else fetches.push(Promise.resolve({ data: [] }));

      if (all || currentTab === "channels") {
        fetches.push(
          supabase.from("channels")
            .select("id, name, description, avatar_url, subscriber_count")
            .or(`name.ilike.${pat},description.ilike.${pat}`)
            .order("subscriber_count", { ascending: false })
            .limit(all ? 4 : 20)
        );
      } else fetches.push(Promise.resolve({ data: [] }));

      if (all || currentTab === "events") {
        fetches.push(
          supabase.from("digital_events")
            .select("id, title, description, emoji, price, event_date, capacity, tickets_sold, creator_id, category, profiles!digital_events_creator_id_fkey(display_name, handle)")
            .or(`title.ilike.${pat},description.ilike.${pat}`)
            .gte("event_date", new Date().toISOString())
            .order("event_date", { ascending: true })
            .limit(all ? 4 : 20)
        );
      } else fetches.push(Promise.resolve({ data: [] }));

      if (all || currentTab === "gifts") {
        fetches.push(
          supabase.from("gifts")
            .select("id, name, emoji, base_xp_cost, rarity, description")
            .or(`name.ilike.${pat},description.ilike.${pat}`)
            .order("base_xp_cost", { ascending: true })
            .limit(all ? 6 : 30)
        );
      } else fetches.push(Promise.resolve({ data: [] }));

      if (all || currentTab === "shops") {
        const [prods, frees, comms] = await Promise.all([
          supabase.from("shop_products").select("id, name, description, images, price_acoin, category, seller_id").ilike("name", pat).eq("is_available", true).limit(all ? 3 : 15),
          supabase.from("freelance_listings").select("id, title, description, price, emoji, seller_id, orders_count, profiles!freelance_listings_seller_id_fkey(display_name, handle)").or(`title.ilike.${pat},description.ilike.${pat}`).eq("is_active", true).limit(all ? 3 : 15),
          supabase.from("paid_communities").select("id, name, description, emoji, price, member_count, creator_id, profiles!paid_communities_creator_id_fkey(display_name, handle)").or(`name.ilike.${pat},description.ilike.${pat}`).limit(all ? 2 : 10),
        ]);
        const shops: ShopResult[] = [
          ...(prods.data || []).map((p: any) => ({ id: p.id, kind: "product" as const, title: p.name, desc: p.description, emoji: null, image_url: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null, price: p.price_acoin ?? 0, badge: p.category, seller_name: "", route: `/shop/${p.seller_id}` })),
          ...(frees.data || []).map((f: any) => ({ id: f.id, kind: "freelance" as const, title: f.title, desc: f.description, emoji: f.emoji, image_url: null, price: f.price, badge: `${f.orders_count} orders`, seller_name: f.profiles?.display_name || "", route: "/freelance" })),
          ...(comms.data || []).map((c: any) => ({ id: c.id, kind: "community" as const, title: c.name, desc: c.description, emoji: c.emoji, image_url: null, price: c.price, badge: `${c.member_count} members`, seller_name: c.profiles?.display_name || "", route: "/paid-communities" })),
        ];
        fetches.push(Promise.resolve({ data: shops, merged: true }));
      } else fetches.push(Promise.resolve({ data: [] }));

      fetches.push(Promise.resolve({ data: searchApps(trimmed) }));

      const [peopleRes, postsRes, channelsRes, eventsRes, giftsRes, shopsRes, appsRes] = await Promise.all(fetches);
      if (id !== searchIdRef.current) return;

      const people: PersonResult[] = peopleRes.data || [];

      let posts: PostResult[] = [];
      if (postsRes.data?.length > 0) {
        const aids = [...new Set(postsRes.data.map((p: any) => p.author_id))];
        const { data: authors } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").in("id", aids as string[]);
        const amap = new Map((authors || []).map((a: any) => [a.id, a]));
        posts = postsRes.data.map((p: any) => {
          const a = amap.get(p.author_id) || {} as any;
          return { id: p.id, content: p.content, image_url: p.image_url || null, author_id: p.author_id, author_handle: a.handle || "", author_name: a.display_name || "", author_avatar: a.avatar_url || null, view_count: p.view_count || 0, created_at: p.created_at };
        });
      }

      const channels: ChannelResult[] = channelsRes.data || [];

      const events: EventResult[] = (eventsRes.data || []).map((e: any) => ({
        id: e.id, title: e.title, description: e.description, emoji: e.emoji || "🎉", price: e.price || 0, event_date: e.event_date, capacity: e.capacity || 0, tickets_sold: e.tickets_sold || 0, category: e.category, creator_name: e.profiles?.display_name || "", creator_handle: e.profiles?.handle || "",
      }));

      const gifts: GiftResult[] = giftsRes.data || [];
      const shops: ShopResult[] = (shopsRes.data && !shopsRes.merged) ? [] : (shopsRes.data || []);
      const apps: AppResult[] = appsRes.data || [];

      const total = people.length + posts.length + channels.length + events.length + gifts.length + shops.length + apps.length;
      setResults({ people, posts, channels, events, gifts, shops, apps });
      setTotalCount(total);
    } catch (e) {
      console.warn("Search error:", e);
    } finally {
      if (id === searchIdRef.current) setLoading(false);
    }
  }, [searchApps]);

  function onChangeText(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (suggestRef.current) clearTimeout(suggestRef.current);
    debounceRef.current = setTimeout(() => performSearch(text, tab, verifiedOnly, sortMode), 380);
    suggestRef.current = setTimeout(() => fetchSuggestions(text), 180);
  }

  function onSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setShowSuggest(false);
    const t = query.trim();
    if (t.length >= 1) {
      addToHistory(t).then(setHistory);
      performSearch(query, tab, verifiedOnly, sortMode);
    }
  }

  function onTabPress(t: SearchTab) {
    setTab(t);
    Haptics.selectionAsync();
    if (query.trim().length >= 1) performSearch(query, t, verifiedOnly, sortMode);
  }

  function clearSearch() {
    setQuery("");
    setResults(EMPTY);
    setHasSearched(false);
    setTotalCount(0);
    setSuggestions([]);
    setShowSuggest(false);
    inputRef.current?.focus();
  }

  function onTagPress(tag: string) {
    const q = `#${tag}`;
    setQuery(q);
    setShowSuggest(false);
    addToHistory(q).then(setHistory);
    performSearch(q, tab, verifiedOnly, sortMode);
  }

  function onHistoryPress(term: string) {
    setQuery(term);
    setShowSuggest(false);
    performSearch(term, tab, verifiedOnly, sortMode);
  }

  function onSuggestionPress(p: PersonResult) {
    setShowSuggest(false);
    setQuery("");
    Haptics.selectionAsync();
    router.push(`/contact/${p.id}` as any);
  }

  function toggleVerified() {
    const nv = !verifiedOnly; setVerifiedOnly(nv);
    if (query.trim().length >= 1) performSearch(query, tab, nv, sortMode);
  }

  function onSortPress(s: "relevance"|"recent"|"popular") {
    setSortMode(s); setShowFilters(false);
    if (query.trim().length >= 1) performSearch(query, tab, verifiedOnly, s);
  }

  function startVoice() {
    if (Platform.OS !== "web") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.interimResults = false;
    setIsListening(true);
    r.onresult = (e: any) => { const t = e.results[0][0].transcript; setQuery(t); setIsListening(false); performSearch(t, tab, verifiedOnly, sortMode); };
    r.onerror = r.onend = () => setIsListening(false);
    r.start();
  }

  const tabCounts: Record<SearchTab, number> = useMemo(() => ({
    all:      totalCount,
    people:   results.people.length,
    posts:    results.posts.length,
    channels: results.channels.length,
    events:   results.events.length,
    gifts:    results.gifts.length,
    shops:    results.shops.length,
    apps:     results.apps.length,
  }), [results, totalCount]);

  const cleanQuery = query.trim().replace(/^[#@]/, "");

  function SectionLabel({ icon, label, count, onSeeAll }: { icon: string; label: string; count: number; onSeeAll?: ()=>void }) {
    if (count === 0) return null;
    return (
      <View style={[styles.sectionLabel, { marginTop: 4 }]}>
        <View style={[styles.sectionIconWrap, { backgroundColor: BRAND + "18" }]}>
          <Ionicons name={icon as any} size={13} color={BRAND} />
        </View>
        <Text style={[styles.sectionLabelText, { color: colors.text }]}>{label}</Text>
        <View style={[styles.countPill, { backgroundColor: BRAND+"18" }]}>
          <Text style={{ color: BRAND, fontSize:11, fontFamily:"Inter_700Bold" }}>{count}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity style={styles.seeAllBtn} onPress={onSeeAll}>
            <Text style={{ color: BRAND, fontSize:12, fontFamily:"Inter_600SemiBold" }}>See all</Text>
            <Ionicons name="chevron-forward" size={12} color={BRAND} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function PersonCard({ p, i }: { p: PersonResult; i: number }) {
    return (
      <Animated.View entering={FadeInRight.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface }]} onPress={() => { Haptics.selectionAsync(); router.push(`/contact/${p.id}` as any); }} activeOpacity={0.75}>
          <View style={styles.av48Wrap}>
            {p.avatar_url
              ? <Image source={{ uri: p.avatar_url }} style={styles.av48} />
              : <AvatarPlaceholder name={p.display_name} size={48} color={BRAND} />}
            {p.is_organization_verified && (
              <View style={styles.orgDotCard}><Ionicons name="checkmark-circle" size={14} color={BRAND} /></View>
            )}
          </View>
          <View style={{ flex:1, gap:2 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:4 }}>
              <Text style={[styles.cardTitle, { color:colors.text }]} numberOfLines={1}>{highlightText(p.display_name, cleanQuery, colors.text, BRAND)}</Text>
              {p.is_verified && !p.is_organization_verified && <Ionicons name="checkmark-circle" size={13} color={BRAND} />}
            </View>
            <Text style={[styles.cardSub, { color:colors.textMuted }]}>@{p.handle}{p.country ? ` · ${p.country}` : ""}</Text>
            {p.bio ? <Text style={[styles.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{p.bio}</Text> : null}
          </View>
          <View style={[styles.viewBtn, { backgroundColor: BRAND + "18" }]}>
            <Text style={{ color:BRAND, fontSize:12, fontFamily:"Inter_600SemiBold" }}>View</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function PostCard({ p, i }: { p: PostResult; i: number }) {
    const hasImage = !!p.image_url;
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface, flexDirection:"column", gap:10 }]} onPress={() => { Haptics.selectionAsync(); router.push(`/p/${p.id}` as any); }} activeOpacity={0.75}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); router.push(`/contact/${p.author_id}` as any); }} activeOpacity={0.8} hitSlop={{ top:4, bottom:4, left:4, right:4 }}>
              {p.author_avatar
                ? <Image source={{ uri: p.author_avatar }} style={styles.av36} />
                : <AvatarPlaceholder name={p.author_name} size={36} color="#007AFF" />}
            </TouchableOpacity>
            <TouchableOpacity style={{ flex:1 }} onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); router.push(`/contact/${p.author_id}` as any); }} activeOpacity={0.8}>
              <Text style={[styles.cardTitle, { color:colors.text, fontSize:13 }]} numberOfLines={1}>{p.author_name}</Text>
              <Text style={[styles.cardSub, { color:colors.textMuted }]}>@{p.author_handle}</Text>
            </TouchableOpacity>
            <View style={[styles.timeChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={{ color:colors.textMuted, fontSize:10, fontFamily:"Inter_500Medium" }}>{timeAgo(p.created_at)}</Text>
            </View>
          </View>
          <Text style={{ color:colors.text, fontSize:14, fontFamily:"Inter_400Regular", lineHeight:22 }} numberOfLines={hasImage ? 2 : 4}>
            {p.content}
          </Text>
          {hasImage && (
            <Image source={{ uri: p.image_url! }} style={{ width:"100%", height:150, borderRadius:12 }} resizeMode="cover" />
          )}
          <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:3 }}>
              <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
              <Text style={{ color:colors.textMuted, fontSize:11 }}>{p.view_count}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function ChannelCard({ ch, i }: { ch: ChannelResult; i: number }) {
    return (
      <Animated.View entering={FadeInRight.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface }]} onPress={() => { Haptics.selectionAsync(); router.push(`/channel/${ch.id}` as any); }} activeOpacity={0.75}>
          {ch.avatar_url
            ? <Image source={{ uri: ch.avatar_url }} style={[styles.av52, { borderRadius:14 }]} />
            : (
              <LinearGradient colors={[BRAND, "#00ACC1"]} style={[styles.av52, { borderRadius:14, alignItems:"center", justifyContent:"center" }]}>
                <Ionicons name="megaphone" size={24} color="#fff" />
              </LinearGradient>
            )}
          <View style={{ flex:1, gap:3 }}>
            <Text style={[styles.cardTitle, { color:colors.text }]} numberOfLines={1}>{ch.name}</Text>
            {ch.description ? <Text style={[styles.bioText, { color:colors.textSecondary }]} numberOfLines={2}>{ch.description}</Text> : null}
            <View style={{ flexDirection:"row", alignItems:"center", gap:3, marginTop:2 }}>
              <Ionicons name="people" size={12} color={colors.textMuted} />
              <Text style={{ color:colors.textMuted, fontSize:11 }}>{(ch.subscriber_count || 0).toLocaleString()} subscribers</Text>
            </View>
          </View>
          <View style={[styles.subBtn, { backgroundColor: "#AF52DE"+"18" }]}>
            <Text style={{ color:"#AF52DE", fontSize:12, fontFamily:"Inter_600SemiBold" }}>Join</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function EventCard({ ev, i }: { ev: EventResult; i: number }) {
    const isFull = ev.capacity > 0 && ev.tickets_sold >= ev.capacity;
    const pct = ev.capacity > 0 ? Math.min((ev.tickets_sold / ev.capacity) * 100, 100) : 0;
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface, flexDirection:"column", gap:12 }]} onPress={() => router.push("/digital-events" as any)} activeOpacity={0.75}>
          <View style={{ flexDirection:"row", gap:12, alignItems:"flex-start" }}>
            <LinearGradient colors={["#FF9500", "#FFCC00"]} style={styles.eventEmoji}>
              <Text style={{ fontSize:26 }}>{ev.emoji}</Text>
            </LinearGradient>
            <View style={{ flex:1, gap:4 }}>
              <Text style={[styles.cardTitle, { color:colors.text }]} numberOfLines={2}>{ev.title}</Text>
              <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={{ color:colors.textMuted, fontSize:11 }}>{formatEventDate(ev.event_date)}</Text>
                {ev.category && <View style={[styles.catPill, { backgroundColor:"#FF9500"+"18" }]}>
                  <Text style={{ color:"#FF9500", fontSize:10, fontFamily:"Inter_600SemiBold" }}>{ev.category}</Text>
                </View>}
              </View>
              {ev.description ? <Text style={[styles.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{ev.description}</Text> : null}
            </View>
            <View style={{ alignItems:"flex-end", gap:4, paddingTop:2 }}>
              {ev.price === 0
                ? <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>FREE</Text></View>
                : <View style={{ flexDirection:"row", alignItems:"center", gap:3, backgroundColor:GOLD+"18", paddingHorizontal:8, paddingVertical:3, borderRadius:8 }}>
                    <Text style={{ color:GOLD, fontSize:13, fontFamily:"Inter_700Bold" }}>{ev.price} AC</Text>
                  </View>
              }
            </View>
          </View>
          {ev.capacity > 0 && (
            <View style={{ gap:5 }}>
              <View style={{ flexDirection:"row", justifyContent:"space-between" }}>
                <Text style={{ color:colors.textMuted, fontSize:11 }}>{ev.tickets_sold.toLocaleString()}/{ev.capacity.toLocaleString()} tickets</Text>
                {isFull
                  ? <Text style={{ color:"#EF4444", fontSize:11, fontFamily:"Inter_600SemiBold" }}>SOLD OUT</Text>
                  : <Text style={{ color:colors.textMuted, fontSize:11 }}>{Math.round(pct)}% filled</Text>
                }
              </View>
              <View style={[styles.progressBg, { backgroundColor:colors.backgroundSecondary }]}>
                <View style={[styles.progressFill, { width:`${pct}%` as any, backgroundColor: pct >= 90 ? "#EF4444" : "#FF9500" }]} />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function GiftGrid({ gifts }: { gifts: GiftResult[] }) {
    const cols = 4;
    const cardW = Math.floor((SW - 48 - (cols - 1) * 8) / cols);
    return (
      <View style={{ flexDirection:"row", flexWrap:"wrap", gap:8, paddingHorizontal:16, paddingBottom:8 }}>
        {gifts.map((g, i) => {
          const rc = RARITY_COLORS[g.rarity] || "#888";
          return (
            <Animated.View key={g.id} entering={FadeIn.delay(i*20).duration(200)}>
              <TouchableOpacity style={[styles.giftCard, { backgroundColor:colors.surface, borderColor:rc+"44", width:cardW }]} onPress={() => router.push("/gifts" as any)} activeOpacity={0.75}>
                <Text style={{ fontSize:30 }}>{g.emoji}</Text>
                <Text style={{ color:colors.text, fontSize:11, fontFamily:"Inter_500Medium", textAlign:"center" }} numberOfLines={1}>{g.name}</Text>
                <View style={{ flexDirection:"row", alignItems:"center", gap:2 }}>
                  <Ionicons name="diamond" size={10} color={GOLD} />
                  <Text style={{ color:GOLD, fontSize:11, fontFamily:"Inter_700Bold" }}>{g.base_xp_cost}</Text>
                </View>
                <View style={[styles.rarityDot, { backgroundColor:rc }]} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  }

  function ShopCard({ s, i }: { s: ShopResult; i: number }) {
    const kindColor = s.kind === "product" ? "#AF52DE" : s.kind === "freelance" ? "#34C759" : "#007AFF";
    const kindGrad: [string,string] = s.kind === "product" ? ["#AF52DE","#BF5AF2"] : s.kind === "freelance" ? ["#34C759","#30D158"] : ["#007AFF","#0A84FF"];
    return (
      <Animated.View entering={FadeInDown.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface }]} onPress={() => router.push(s.route as any)} activeOpacity={0.75}>
          {s.image_url
            ? <Image source={{ uri: s.image_url }} style={[styles.av52, { borderRadius:14 }]} resizeMode="cover" />
            : (
              <LinearGradient colors={kindGrad} style={[styles.av52, { borderRadius:14, alignItems:"center", justifyContent:"center" }]}>
                <Text style={{ fontSize:26 }}>{s.emoji || "📦"}</Text>
              </LinearGradient>
            )}
          <View style={{ flex:1, gap:3 }}>
            <Text style={[styles.cardTitle, { color:colors.text }]} numberOfLines={1}>{s.title}</Text>
            {s.desc ? <Text style={[styles.bioText, { color:colors.textSecondary }]} numberOfLines={1}>{s.desc}</Text> : null}
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

  function AppCard({ a, i }: { a: AppResult; i: number }) {
    return (
      <Animated.View entering={FadeInRight.delay(i*25).duration(220)}>
        <TouchableOpacity style={[styles.card, { backgroundColor:colors.surface }]} onPress={() => router.push(a.route as any)} activeOpacity={0.75}>
          <LinearGradient colors={a.gradient} style={[styles.av52, { borderRadius:16, alignItems:"center", justifyContent:"center" }]}>
            <Ionicons name={a.icon} size={24} color="#fff" />
          </LinearGradient>
          <View style={{ flex:1, gap:4 }}>
            <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
              <Text style={[styles.cardTitle, { color:colors.text }]}>{a.label}</Text>
              <View style={[styles.catPill, { backgroundColor:a.gradient[0]+"22" }]}>
                <Text style={{ color:a.gradient[0], fontSize:9, fontFamily:"Inter_600SemiBold" }}>{a.category}</Text>
              </View>
            </View>
            <Text style={[styles.bioText, { color:colors.textSecondary }]} numberOfLines={2}>{a.desc}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  function renderResults() {
    const showPeople   = (tab === "all" || tab === "people")   && results.people.length > 0;
    const showPosts    = (tab === "all" || tab === "posts")    && results.posts.length > 0;
    const showChannels = (tab === "all" || tab === "channels") && results.channels.length > 0;
    const showEvents   = (tab === "all" || tab === "events")   && results.events.length > 0;
    const showGifts    = (tab === "all" || tab === "gifts")    && results.gifts.length > 0;
    const showShops    = (tab === "all" || tab === "shops")    && results.shops.length > 0;
    const showApps     = (tab === "all" || tab === "apps")     && results.apps.length > 0;
    const anyResults = showPeople || showPosts || showChannels || showEvents || showGifts || showShops || showApps;

    if (!anyResults) {
      return (
        <ScrollView contentContainerStyle={{ flexGrow:1, alignItems:"center", justifyContent:"center", paddingBottom: scrollPB + 32 }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(320)} style={{ alignItems:"center", paddingHorizontal:32 }}>
            <LinearGradient colors={[BRAND+"28", BRAND+"08"]} style={[styles.emptyIcon, { width:100, height:100, borderRadius:50, marginBottom:20 }]}>
              <Ionicons name="search-outline" size={44} color={BRAND} />
            </LinearGradient>
            <Text style={[styles.emptyTitle, { color:colors.text, fontSize:20 }]}>Nothing found</Text>
            <Text style={[styles.emptySub, { color:colors.textSecondary, marginTop:6, marginBottom:28 }]}>
              No results for <Text style={{ fontFamily:"Inter_600SemiBold", color:colors.text }}>"{query.trim()}"</Text>
              {"\n"}Try different keywords or check the spelling.
            </Text>
            <View style={[{ width:"100%", borderRadius:16, padding:16, gap:12, backgroundColor:colors.surface }]}>
              <Text style={{ color:colors.textMuted, fontSize:12, fontFamily:"Inter_600SemiBold", letterSpacing:0.5, textTransform:"uppercase" }}>Explore trending</Text>
              <View style={styles.tagsWrap}>
                {TRENDING_TAGS.slice(0,8).map(tag => (
                  <TouchableOpacity key={tag} style={[styles.tagChip, { backgroundColor:BRAND+"12", borderColor:BRAND+"25" }]} onPress={() => onTagPress(tag)} activeOpacity={0.7}>
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
        <Animated.View entering={FadeInDown.duration(250)} style={[styles.resultsBanner, { backgroundColor:colors.surface, borderBottomColor:colors.border }]}>
          <Ionicons name="search" size={14} color={BRAND} />
          <Text style={{ color:colors.textSecondary, fontSize:13, fontFamily:"Inter_400Regular" }}>
            <Text style={{ fontFamily:"Inter_600SemiBold", color:colors.text }}>{totalCount}</Text> results for{" "}
            <Text style={{ fontFamily:"Inter_600SemiBold", color:BRAND }}>"{query.trim()}"</Text>
          </Text>
        </Animated.View>

        {showPeople && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="people" label="People" count={results.people.length} onSeeAll={tab === "all" && results.people.length >= 5 ? () => onTabPress("people") : undefined} />
            {results.people.map((p, i) => <PersonCard key={p.id} p={p} i={i} />)}
          </View>
        )}

        {showPosts && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="document-text" label="Posts" count={results.posts.length} onSeeAll={tab === "all" && results.posts.length >= 5 ? () => onTabPress("posts") : undefined} />
            {results.posts.map((p, i) => <PostCard key={p.id} p={p} i={i} />)}
          </View>
        )}

        {showChannels && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="megaphone" label="Channels" count={results.channels.length} onSeeAll={tab === "all" && results.channels.length >= 4 ? () => onTabPress("channels") : undefined} />
            {results.channels.map((ch, i) => <ChannelCard key={ch.id} ch={ch} i={i} />)}
          </View>
        )}

        {showEvents && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="calendar" label="Events" count={results.events.length} onSeeAll={tab === "all" && results.events.length >= 4 ? () => onTabPress("events") : undefined} />
            {results.events.map((ev, i) => <EventCard key={ev.id} ev={ev} i={i} />)}
          </View>
        )}

        {showGifts && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="gift" label="Gifts" count={results.gifts.length} onSeeAll={tab === "all" && results.gifts.length >= 6 ? () => onTabPress("gifts") : undefined} />
            <GiftGrid gifts={results.gifts} />
          </View>
        )}

        {showShops && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="storefront" label="Shops & Services" count={results.shops.length} onSeeAll={tab === "all" && results.shops.length >= 5 ? () => onTabPress("shops") : undefined} />
            {results.shops.map((s, i) => <ShopCard key={`${s.kind}-${s.id}`} s={s} i={i} />)}
          </View>
        )}

        {showApps && (
          <View style={{ paddingTop:16 }}>
            <SectionLabel icon="grid" label="Apps & Games" count={results.apps.length} onSeeAll={undefined} />
            {results.apps.map((a, i) => <AppCard key={a.id} a={a} i={i} />)}
          </View>
        )}
      </ScrollView>
    );
  }

  function renderLoading() {
    return (
      <ScrollView contentContainerStyle={{ paddingTop:16, paddingBottom:scrollPB }} showsVerticalScrollIndicator={false}>
        {[1,2,3,4,5].map(i => <CardSkeleton key={i} />)}
      </ScrollView>
    );
  }

  function renderIdle() {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom:scrollPB }}>
        {/* Quick categories */}
        <View style={{ paddingHorizontal:16, paddingTop:20 }}>
          <View style={[styles.idleSectionHeader, { marginBottom:0 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: BRAND+"18" }]}>
              <Ionicons name="compass" size={13} color={BRAND} />
            </View>
            <Text style={[styles.idleHeading, { color:colors.text }]}>Browse Categories</Text>
          </View>
          <View style={styles.quickGrid}>
            {QUICK_CATEGORIES.map((qc, i) => (
              <Animated.View key={qc.id} entering={FadeInDown.delay(i*30).duration(200)}>
                <TouchableOpacity
                  style={[styles.quickCard, { width:quickCardW, backgroundColor:colors.surface }]}
                  onPress={() => qc.route ? router.push(qc.route as any) : (setTab(qc.id as SearchTab), inputRef.current?.focus())}
                  activeOpacity={0.78}
                >
                  <LinearGradient
                    colors={qc.gradient as [string, string]}
                    style={styles.quickIcon}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name={qc.icon as any} size={24} color="#fff" />
                  </LinearGradient>
                  <Text style={[styles.quickLabel, { color:colors.text }]}>{qc.label}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Trending People */}
        {trendingPeople.length > 0 && (
          <View style={{ paddingTop:28 }}>
            <View style={[styles.idleSectionHeader, { paddingHorizontal:16, marginBottom:12 }]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: BRAND+"18" }]}>
                <Ionicons name="trending-up" size={13} color={BRAND} />
              </View>
              <Text style={[styles.idleHeading, { color:colors.text }]}>Trending People</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:10, paddingHorizontal:16, paddingBottom:4 }}>
              {trendingPeople.map((p, i) => (
                <Animated.View key={p.id} entering={FadeInRight.delay(i*30).duration(200)}>
                  <TouchableOpacity style={[styles.personChip, { backgroundColor:colors.surface }]} onPress={() => router.push(`/contact/${p.id}` as any)} activeOpacity={0.78}>
                    <View style={styles.av48Wrap}>
                      {p.avatar_url
                        ? <Image source={{ uri: p.avatar_url }} style={styles.personChipAvatar} />
                        : <AvatarPlaceholder name={p.display_name} size={44} color={BRAND} />}
                      {p.is_verified && <View style={styles.orgDotCard}><Ionicons name="checkmark-circle" size={13} color={p.is_organization_verified ? GOLD : BRAND} /></View>}
                    </View>
                    <View style={{ alignItems:"center", gap:1 }}>
                      <Text style={[styles.personChipName, { color:colors.text }]} numberOfLines={1}>{p.display_name}</Text>
                      <Text style={{ color:colors.textMuted, fontSize:10, fontFamily:"Inter_400Regular" }}>@{p.handle}</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trending Hashtags */}
        <View style={{ paddingHorizontal:16, paddingTop:28 }}>
          <View style={[styles.idleSectionHeader, { marginBottom:14 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: "#AF52DE"+"18" }]}>
              <Ionicons name="pricetag" size={13} color="#AF52DE" />
            </View>
            <Text style={[styles.idleHeading, { color:colors.text }]}>Trending Topics</Text>
          </View>
          <View style={styles.tagsWrap}>
            {TRENDING_TAGS.map((tag, i) => (
              <Animated.View key={tag} entering={FadeIn.delay(i*20).duration(180)}>
                <TouchableOpacity
                  style={[styles.tagChip, { backgroundColor:"#AF52DE"+"12", borderColor:"#AF52DE"+"28" }]}
                  onPress={() => onTagPress(tag)}
                  activeOpacity={0.75}
                >
                  <Text style={{ color:"#AF52DE", fontSize:13, fontFamily:"Inter_700Bold" }}>#</Text>
                  <Text style={{ color:"#AF52DE", fontSize:13, fontFamily:"Inter_500Medium" }}>{tag}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Search History */}
        {history.length > 0 && (
          <View style={{ paddingHorizontal:16, paddingTop:24 }}>
            <View style={[styles.idleSectionHeader, { marginBottom:12 }]}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.idleHeading, { color:colors.text, marginBottom:0 }]}>Recent Searches</Text>
              <TouchableOpacity style={{ marginLeft:"auto" }} onPress={() => clearHistory().then(setHistory)}>
                <Text style={{ color:colors.textMuted, fontSize:12, fontFamily:"Inter_500Medium" }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {history.slice(0,8).map((term, i) => (
              <TouchableOpacity key={`${term}-${i}`} style={[styles.histRow, { backgroundColor:colors.surface, borderColor:colors.border }]} onPress={() => onHistoryPress(term)} activeOpacity={0.75}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text style={[{ flex:1, fontSize:14, fontFamily:"Inter_400Regular", color:colors.text }]}>{term}</Text>
                <TouchableOpacity hitSlop={{ top:8, bottom:8, left:8, right:8 }} onPress={() => removeFromHistory(term).then(setHistory)}>
                  <Ionicons name="close" size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Saved Searches */}
        {saved.length > 0 && (
          <View style={{ paddingHorizontal:16, paddingTop:24 }}>
            <View style={[styles.idleSectionHeader, { marginBottom:12 }]}>
              <Ionicons name="bookmark-outline" size={16} color={GOLD} />
              <Text style={[styles.idleHeading, { color:colors.text, marginBottom:0 }]}>Saved Searches</Text>
            </View>
            {saved.slice(0,5).map((s) => (
              <TouchableOpacity key={s.id} style={[styles.histRow, { backgroundColor:colors.surface, borderColor:colors.border }]} onPress={() => onHistoryPress(s.query)} activeOpacity={0.75}>
                <Ionicons name="bookmark" size={14} color={GOLD} />
                <Text style={[{ flex:1, fontSize:14, fontFamily:"Inter_400Regular", color:colors.text }]}>{s.query}</Text>
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

  return (
    <View style={[styles.root, { backgroundColor:colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border, zIndex: 20, overflow: "visible" as any }]}>
        <Text style={[styles.headerTitle, { color:colors.text }]}>Search</Text>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor:colors.inputBg, borderColor: query.length > 0 ? BRAND+"50" : colors.border }]}>
          <Ionicons name="search" size={18} color={query.length > 0 ? BRAND : colors.textMuted} style={{ marginRight:2 }} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color:colors.text }]}
            placeholder="Search people, posts, gifts, apps…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0
            ? <TouchableOpacity onPress={clearSearch} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            : Platform.OS === "web"
              ? <TouchableOpacity onPress={startVoice} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Ionicons name={isListening ? "mic" : "mic-outline"} size={18} color={isListening ? MATCH : colors.textMuted} />
                </TouchableOpacity>
              : null
          }
        </View>

        {/* Action row */}
        <View style={styles.actionRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6 }}>
            {/* Verified filter */}
            <TouchableOpacity style={[styles.filterPill, verifiedOnly && { backgroundColor:BRAND, borderColor:BRAND }]} onPress={toggleVerified}>
              <Ionicons name="checkmark-circle" size={13} color={verifiedOnly ? "#fff" : colors.textMuted} />
              <Text style={{ color: verifiedOnly ? "#fff" : colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium" }}>Verified</Text>
            </TouchableOpacity>

            {/* Sort options */}
            {(["relevance","recent","popular"] as const).map(s => (
              <TouchableOpacity key={s} style={[styles.filterPill, sortMode === s && { backgroundColor:BRAND+"18", borderColor:BRAND+"50" }]} onPress={() => onSortPress(s)}>
                <Ionicons name={s === "relevance" ? "flash-outline" : s === "recent" ? "time-outline" : "trending-up-outline"} size={13} color={sortMode === s ? BRAND : colors.textMuted} />
                <Text style={{ color: sortMode === s ? BRAND : colors.textSecondary, fontSize:12, fontFamily:"Inter_500Medium", textTransform:"capitalize" }}>{s}</Text>
              </TouchableOpacity>
            ))}

            {/* Save search */}
            {hasSearched && query.trim().length >= 2 && (
              <TouchableOpacity style={[styles.filterPill, saved.some(s => s.query.toLowerCase() === query.trim().toLowerCase()) && { backgroundColor:GOLD+"18", borderColor:GOLD+"50" }]}
                onPress={() => {
                  const ex = saved.find(s => s.query.toLowerCase() === query.trim().toLowerCase());
                  if (ex) removeSavedSearch(ex.id).then(setSaved);
                  else saveSearch(query.trim(), tab).then(setSaved);
                }}>
                <Ionicons name="bookmark-outline" size={13} color={GOLD} />
                <Text style={{ color:GOLD, fontSize:12, fontFamily:"Inter_500Medium" }}>Save</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Category Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {TABS.map(t => {
            const active = tab === t.id;
            const cnt = tabCounts[t.id];
            return (
              <TouchableOpacity key={t.id} style={[styles.tabPill, active && { backgroundColor:BRAND }]} onPress={() => onTabPress(t.id)} activeOpacity={0.75}>
                <Ionicons name={t.icon as any} size={13} color={active ? "#fff" : colors.textMuted} />
                <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize:12, fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" }}>{t.label}</Text>
                {hasSearched && cnt > 0 && (
                  <View style={[styles.tabBadge, { backgroundColor: active ? "#ffffff40" : BRAND+"20" }]}>
                    <Text style={{ color: active ? "#fff" : BRAND, fontSize:9, fontFamily:"Inter_700Bold" }}>{cnt}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Suggestions dropdown — inside header so absolute top:"100%" sits just below it */}
        {showSuggest && suggestions.length > 0 && (
          <Animated.View entering={FadeIn.duration(150)} style={[styles.suggestBox, { backgroundColor:colors.surface, borderColor:colors.border }]}>
            {suggestions.map(p => (
              <TouchableOpacity key={p.id} style={styles.suggestRow} onPress={() => onSuggestionPress(p)} activeOpacity={0.75}>
                {p.avatar_url
                  ? <Image source={{ uri: p.avatar_url }} style={{ width:30, height:30, borderRadius:15 }} />
                  : <AvatarPlaceholder name={p.display_name} size={30} color={BRAND} />}
                <View style={{ flex:1 }}>
                  <Text style={{ color:colors.text, fontSize:13, fontFamily:"Inter_500Medium" }} numberOfLines={1}>{p.display_name}</Text>
                  <Text style={{ color:colors.textMuted, fontSize:11 }}>@{p.handle}</Text>
                </View>
                <VerifiedBadge verified={p.is_verified} org={p.is_organization_verified} />
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </View>

      {/* Body */}
      <View style={{ flex:1 }}>
        {loading
          ? renderLoading()
          : hasSearched
            ? renderResults()
            : renderIdle()
        }
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:            { flex:1 },
  header:          { borderBottomWidth:StyleSheet.hairlineWidth, paddingBottom:0 },
  headerTitle:     { fontSize:22, fontFamily:"Inter_700Bold", paddingHorizontal:16, marginBottom:10 },
  searchBar:       { flexDirection:"row", alignItems:"center", marginHorizontal:16, paddingHorizontal:12, paddingVertical:10, borderRadius:14, borderWidth:1.5, gap:8 },
  searchInput:     { flex:1, fontSize:15, fontFamily:"Inter_400Regular", padding:0 },
  actionRow:       { paddingHorizontal:16, paddingVertical:8 },
  filterPill:      { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:11, paddingVertical:6, borderRadius:20, borderWidth:1, borderColor:"rgba(128,128,128,0.2)" },
  tabsRow:         { paddingHorizontal:12, paddingTop:4, paddingBottom:10, gap:6 },
  tabPill:         { flexDirection:"row", alignItems:"center", gap:5, paddingHorizontal:12, paddingVertical:7, borderRadius:20, backgroundColor:"transparent" },
  tabBadge:        { borderRadius:8, paddingHorizontal:5, paddingVertical:1, minWidth:16, alignItems:"center" },
  suggestBox:      { position:"absolute", top:"100%" as any, left:16, right:16, zIndex:100, borderRadius:14, borderWidth:StyleSheet.hairlineWidth, shadowColor:"#000", shadowOpacity:0.15, shadowRadius:16, shadowOffset:{ width:0, height:6 }, elevation:16 },
  suggestRow:      { flexDirection:"row", alignItems:"center", gap:10, padding:12 },
  resultsBanner:   { flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:16, paddingVertical:10, borderBottomWidth:StyleSheet.hairlineWidth },
  sectionLabel:    { flexDirection:"row", alignItems:"center", gap:8, paddingHorizontal:16, paddingBottom:10 },
  sectionIconWrap: { width:26, height:26, borderRadius:8, alignItems:"center", justifyContent:"center" },
  sectionLabelText:{ fontSize:15, fontFamily:"Inter_700Bold", flex:1 },
  countPill:       { borderRadius:10, paddingHorizontal:8, paddingVertical:3 },
  seeAllBtn:       { flexDirection:"row", alignItems:"center", gap:2, marginLeft:"auto" as any },
  card:            { flexDirection:"row", alignItems:"center", gap:12, marginHorizontal:16, marginBottom:10, padding:14, borderRadius:18, shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  cardTitle:       { fontSize:15, fontFamily:"Inter_600SemiBold" },
  cardSub:         { fontSize:12, fontFamily:"Inter_400Regular" },
  bioText:         { fontSize:12, fontFamily:"Inter_400Regular", lineHeight:17 },
  av48:            { width:48, height:48, borderRadius:24 },
  av48Wrap:        { position:"relative" },
  orgDotCard:      { position:"absolute", bottom:-1, right:-1, backgroundColor:"#fff", borderRadius:8 },
  av36:            { width:36, height:36, borderRadius:18 },
  av52:            { width:52, height:52 },
  av44:            { width:44, height:44, borderRadius:22 },
  viewBtn:         { paddingHorizontal:12, paddingVertical:6, borderRadius:10 },
  subBtn:          { paddingHorizontal:12, paddingVertical:6, borderRadius:10 },
  timeChip:        { paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  giftCard:        { alignItems:"center", borderRadius:16, borderWidth:1, paddingVertical:12, paddingHorizontal:6, gap:4, shadowColor:"#000", shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:4, elevation:2 },
  rarityDot:       { width:7, height:7, borderRadius:3.5 },
  eventEmoji:      { width:54, height:54, borderRadius:16, alignItems:"center", justifyContent:"center" },
  catPill:         { flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  freeBadge:       { backgroundColor:SUCCESS+"22", paddingHorizontal:8, paddingVertical:3, borderRadius:8 },
  freeBadgeText:   { color:SUCCESS, fontSize:10, fontFamily:"Inter_700Bold" },
  progressBg:      { height:5, borderRadius:3, overflow:"hidden" },
  progressFill:    { height:5, borderRadius:3 },
  emptyWrap:       { flex:1, alignItems:"center", paddingTop:60, paddingHorizontal:32, gap:10 },
  emptyIcon:       { width:88, height:88, borderRadius:44, alignItems:"center", justifyContent:"center", marginBottom:8 },
  emptyTitle:      { fontSize:18, fontFamily:"Inter_600SemiBold", textAlign:"center" },
  emptySub:        { fontSize:14, fontFamily:"Inter_400Regular", textAlign:"center", lineHeight:20 },
  idleHeading:     { fontSize:16, fontFamily:"Inter_700Bold", marginBottom:0 },
  idleSectionHeader:{ flexDirection:"row", alignItems:"center", gap:8, marginBottom:4 },
  quickGrid:       { flexDirection:"row", flexWrap:"wrap", gap:10, marginTop:14 },
  quickCard:       { alignItems:"center", borderRadius:18, paddingVertical:16, paddingHorizontal:6, gap:10, shadowColor:"#000", shadowOffset:{width:0,height:2}, shadowOpacity:0.06, shadowRadius:8, elevation:3 },
  quickIcon:       { width:50, height:50, borderRadius:16, alignItems:"center", justifyContent:"center" },
  quickLabel:      { fontSize:12, fontFamily:"Inter_600SemiBold", textAlign:"center" },
  personChip:      { alignItems:"center", borderRadius:18, paddingVertical:14, paddingHorizontal:14, gap:8, width:110, shadowColor:"#000", shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  personChipAvatar:{ width:44, height:44, borderRadius:22 },
  personChipName:  { fontSize:12, fontFamily:"Inter_600SemiBold", maxWidth:82 },
  tagsWrap:        { flexDirection:"row", flexWrap:"wrap", gap:8 },
  tagChip:         { flexDirection:"row", alignItems:"center", gap:2, paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1 },
  histRow:         { flexDirection:"row", alignItems:"center", gap:10, padding:13, borderRadius:14, borderWidth:StyleSheet.hairlineWidth, marginBottom:6 },
});
