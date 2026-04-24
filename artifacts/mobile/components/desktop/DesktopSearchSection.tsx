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
import { Avatar } from "@/components/ui/Avatar";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import {
  DesktopButton,
  DesktopChip,
  DesktopEmptyState,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  DesktopToolbar,
  useDesktopTheme,
  useHover,
} from "./ui";

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

const SUGGESTED = [
  "afuchat",
  "music",
  "fashion",
  "tech",
  "africa",
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

function ResultRow({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.resultRow,
        { borderBottomColor: t.border, backgroundColor: hovered ? t.rowHover : "transparent" },
      ]}
      {...(hp as any)}
    >
      {children}
    </TouchableOpacity>
  );
}

export function DesktopSearchSection() {
  const t = useDesktopTheme();
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

  const trimmed = query.trim();
  const hasResults = users.length > 0 || posts.length > 0 || channels.length > 0;
  const isEmpty = trimmed.length >= 2 && !searching && !hasResults;

  const data: (UserResult | PostResult | ChannelResult)[] =
    tab === "people" ? users : tab === "posts" ? posts : channels;

  return (
    <DesktopSectionShell>
      <View style={{ width: "100%", maxWidth: 880, alignSelf: "center", flex: 1 }}>
        <DesktopPanel flex={1}>
          <DesktopPageHeader
            icon="search-outline"
            title="Search"
            subtitle="Find people, posts and channels across AfuChat"
          />

          {/* Search bar */}
          <View style={{ paddingHorizontal: 18, paddingTop: 14 }}>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: t.inputBg, borderColor: t.inputBorder },
              ]}
            >
              <Ionicons name="search-outline" size={17} color={t.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: t.text }]}
                placeholder="Type to search…"
                placeholderTextColor={t.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus={Platform.OS === "web"}
                returnKeyType="search"
              />
              {searching ? (
                <ActivityIndicator size="small" color={t.accent} />
              ) : query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={17} color={t.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Tabs (only show when searching) */}
          {trimmed.length >= 2 && (
            <DesktopToolbar style={{ flexWrap: "wrap" as any }}>
              {TABS.map((tt) => {
                const count = tt.key === "people" ? users.length : tt.key === "posts" ? posts.length : channels.length;
                return (
                  <DesktopChip
                    key={tt.key}
                    icon={tt.icon}
                    label={`${tt.label}${count > 0 ? ` · ${count}` : ""}`}
                    active={tab === tt.key}
                    onPress={() => setTab(tt.key)}
                  />
                );
              })}
            </DesktopToolbar>
          )}

          {/* Results / empty / prompt */}
          {trimmed.length < 2 ? (
            <View style={{ flex: 1, padding: 24 }}>
              <DesktopEmptyState
                icon="compass-outline"
                title="Search AfuChat"
                subtitle="Try a name, a topic, or a channel — start typing to see live results."
              />
              <View style={{ marginTop: 24, alignItems: "center" }}>
                <Text style={{ color: t.textMuted, fontFamily: "Inter_500Medium", fontSize: 12, marginBottom: 8 }}>
                  TRENDING
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  {SUGGESTED.map((s) => (
                    <DesktopChip key={s} label={`#${s}`} onPress={() => setQuery(s)} />
                  ))}
                </View>
              </View>
            </View>
          ) : isEmpty ? (
            <DesktopEmptyState
              icon="search-outline"
              title={`No results for “${query}”`}
              subtitle="Try a different keyword or check the spelling."
            />
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => {
                if (tab === "people") {
                  const u = item as UserResult;
                  return (
                    <ResultRow onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })}>
                      <Avatar uri={u.avatar_url} name={u.display_name} size={42} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Text style={[styles.resultName, { color: t.text }]} numberOfLines={1}>{u.display_name}</Text>
                          <VerifiedBadge isVerified={u.is_verified} isOrganizationVerified={u.is_organization_verified} size={13} />
                        </View>
                        <Text style={[styles.resultHandle, { color: t.textMuted }]}>@{u.handle}</Text>
                        {!!u.bio && (
                          <Text style={[styles.resultBio, { color: t.textSub ?? t.text }]} numberOfLines={2}>{u.bio}</Text>
                        )}
                      </View>
                      <DesktopButton label="View" variant="secondary" size="sm" onPress={() => router.push({ pathname: "/contact/[id]", params: { id: u.id } })} />
                    </ResultRow>
                  );
                }
                if (tab === "posts") {
                  const p = item as PostResult;
                  return (
                    <ResultRow onPress={() => router.push({ pathname: "/post/[id]", params: { id: p.id } } as any)}>
                      <Avatar uri={p.author?.avatar_url || null} name={p.author?.display_name || "?"} size={36} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.resultHandle, { color: t.accent }]}>
                          @{p.author?.handle} · {timeAgo(p.created_at)}
                        </Text>
                        <Text style={[styles.resultBio, { color: t.text }]} numberOfLines={3}>{p.content}</Text>
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={t.textMuted} />
                    </ResultRow>
                  );
                }
                const ch = item as ChannelResult;
                return (
                  <ResultRow onPress={() => router.push(`/chat/${ch.id}` as any)}>
                    <Avatar uri={ch.avatar_url} name={ch.name} size={42} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.resultName, { color: t.text }]} numberOfLines={1}>{ch.name}</Text>
                      {!!ch.description && (
                        <Text style={[styles.resultBio, { color: t.textSub ?? t.text }]} numberOfLines={2}>{ch.description}</Text>
                      )}
                      <Text style={[styles.resultHandle, { color: t.textMuted }]}>
                        {ch.subscriber_count} subscribers
                      </Text>
                    </View>
                    <DesktopButton label="Open" variant="secondary" size="sm" onPress={() => router.push(`/chat/${ch.id}` as any)} />
                  </ResultRow>
                );
              }}
            />
          )}
        </DesktopPanel>
      </View>
    </DesktopSectionShell>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultHandle: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultBio: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 18 },
});
