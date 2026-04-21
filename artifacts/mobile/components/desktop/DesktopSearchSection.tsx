import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

const BRAND = "#00BCD4";

type UserResult = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  bio: string | null;
};

type PostResult = {
  id: string;
  content: string;
  created_at: string;
  author: { id: string; display_name: string; avatar_url: string | null; handle: string } | null;
};

type ChannelResult = {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  subscriber_count: number;
};

type Tab = "people" | "posts" | "channels";

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "people",   label: "People",   icon: "person-outline" },
  { key: "posts",    label: "Posts",    icon: "newspaper-outline" },
  { key: "channels", label: "Channels", icon: "megaphone-outline" },
];

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function DesktopSearchSection() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [channels, setChannels] = useState<ChannelResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setUsers([]); setPosts([]); setChannels([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const term = `%${q.trim()}%`;
    const [usersRes, postsRes, channelsRes] = await Promise.all([
      supabase.from("profiles")
        .select("id, display_name, handle, avatar_url, is_verified, is_organization_verified, bio")
        .or(`display_name.ilike.${term},handle.ilike.${term}`)
        .limit(20),
      supabase.from("posts")
        .select(`id, content, created_at,
          profiles!posts_author_id_fkey(id, display_name, avatar_url, handle)`)
        .ilike("content", term)
        .eq("is_blocked", false)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("channels")
        .select("id, name, description, avatar_url, subscriber_count")
        .ilike("name", term)
        .limit(15),
    ]);

    setUsers(usersRes.data || []);
    setPosts((postsRes.data || []).map((p: any) => ({ ...p, author: p.profiles })));
    setChannels(channelsRes.data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  const hasResults = users.length > 0 || posts.length > 0 || channels.length > 0;
  const isEmpty = query.trim().length >= 2 && !searching && !hasResults;

  return (
    <View style={[styles.root, { backgroundColor: isDark ? "#0f0f12" : "#f8f9fc" }]}>
      {/* Search header */}
      <View style={[styles.searchHeader, { backgroundColor: isDark ? "#0f0f12" : "#ffffff", borderBottomColor: colors.border }]}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Search</Text>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search people, posts, channels…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus={Platform.OS === "web"}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          {searching && <ActivityIndicator size="small" color={colors.accent} />}
        </View>
      </View>

      {/* Tabs */}
      {query.trim().length >= 2 && (
        <View style={[styles.tabRow, { backgroundColor: isDark ? "#0f0f12" : "#ffffff", borderBottomColor: colors.border }]}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={14} color={tab === t.key ? colors.accent : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: tab === t.key ? colors.accent : colors.textMuted }, tab === t.key && { fontFamily: "Inter_600SemiBold" }]}>
                {t.label}
                {t.key === "people" && users.length > 0 ? ` (${users.length})` : ""}
                {t.key === "posts" && posts.length > 0 ? ` (${posts.length})` : ""}
                {t.key === "channels" && channels.length > 0 ? ` (${channels.length})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Results */}
      <View style={styles.results}>
        {query.trim().length < 2 ? (
          <View style={styles.promptWrap}>
            <Ionicons name="search" size={52} color={colors.textMuted} />
            <Text style={[styles.promptTitle, { color: colors.text }]}>Discover AfuChat</Text>
            <Text style={[styles.promptSub, { color: colors.textMuted }]}>
              Search for people, posts, channels and more
            </Text>
          </View>
        ) : isEmpty ? (
          <View style={styles.promptWrap}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.promptTitle, { color: colors.text }]}>No results for "{query}"</Text>
            <Text style={[styles.promptSub, { color: colors.textMuted }]}>Try a different search term</Text>
          </View>
        ) : (
          <FlatList<UserResult | PostResult | ChannelResult>
            data={(tab === "people" ? users : tab === "posts" ? posts : channels) as (UserResult | PostResult | ChannelResult)[]}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.resultList}
            renderItem={({ item }) => {
              if (tab === "people") {
                const u = item as UserResult;
                return (
                  <TouchableOpacity
                    style={[styles.resultRow, { borderBottomColor: colors.border }]}
                    onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })}
                    activeOpacity={0.8}
                  >
                    <Avatar uri={u.avatar_url} name={u.display_name} size={46} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Text style={[styles.resultName, { color: colors.text }]}>{u.display_name}</Text>
                        <VerifiedBadge isVerified={u.is_verified} isOrganizationVerified={u.is_organization_verified} size={13} />
                      </View>
                      <Text style={[styles.resultHandle, { color: colors.textMuted }]}>@{u.handle}</Text>
                      {u.bio && (
                        <Text style={[styles.resultBio, { color: colors.textMuted }]} numberOfLines={2}>{u.bio}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.accent }]}
                      onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.accent }]}>View</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              }
              if (tab === "posts") {
                const p = item as PostResult;
                return (
                  <TouchableOpacity
                    style={[styles.resultRow, { borderBottomColor: colors.border }]}
                    onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } } as any)}
                    activeOpacity={0.8}
                  >
                    <Avatar uri={(p as PostResult).author?.avatar_url || null} name={(p as PostResult).author?.display_name || "?"} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resultHandle, { color: colors.accent }]}>
                        @{(p as PostResult).author?.handle} · {timeAgo((p as PostResult).created_at)}
                      </Text>
                      <Text style={[styles.resultBio, { color: colors.text }]} numberOfLines={3}>{(p as PostResult).content}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              }
              const ch = item as ChannelResult;
              return (
                <TouchableOpacity
                  style={[styles.resultRow, { borderBottomColor: colors.border }]}
                  onPress={() => router.push(`/chat/${ch.id}` as any)}
                  activeOpacity={0.8}
                >
                  <Avatar uri={ch.avatar_url} name={ch.name} size={46} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color: colors.text }]}>{ch.name}</Text>
                    {ch.description && (
                      <Text style={[styles.resultBio, { color: colors.textMuted }]} numberOfLines={2}>{ch.description}</Text>
                    )}
                    <Text style={[styles.resultHandle, { color: colors.textMuted }]}>
                      {ch.subscriber_count} subscribers
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.accent }]}
                    onPress={() => router.push(`/chat/${ch.id}` as any)}
                  >
                    <Text style={[styles.actionBtnText, { color: colors.accent }]}>Open</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "column", overflow: "hidden" },
  searchHeader: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  results: { flex: 1, overflow: "hidden" },
  resultList: {
    maxWidth: 720,
    alignSelf: "center",
    width: "100%" as any,
    paddingBottom: 40,
  },
  promptWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 48,
  },
  promptTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  promptSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultBio: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 18 },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    alignSelf: "center",
    flexShrink: 0,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
