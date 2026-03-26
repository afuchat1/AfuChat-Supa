import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

type SearchScope = "all" | "users" | "posts" | "chats" | "files" | "links";

type Result = {
  type: "user" | "post" | "chat" | "file" | "link";
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string;
  meta?: string;
  route?: string;
  params?: Record<string, string>;
};

const SCOPES: { key: SearchScope; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "search" },
  { key: "users", label: "Users", icon: "people" },
  { key: "posts", label: "Posts", icon: "newspaper" },
  { key: "chats", label: "Chats", icon: "chatbubbles" },
  { key: "files", label: "Files", icon: "document" },
  { key: "links", label: "Links", icon: "link" },
];

const RECENT_SEARCHES_KEY = "recent_searches";
const MAX_RECENT = 8;

export default function UniversalSearchScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, Result[]>>({});
  const [recents, setRecents] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (q: string, sc: SearchScope) => {
    if (!q.trim()) { setResults({}); setHasSearched(false); return; }
    setLoading(true);
    setHasSearched(true);

    const [usersRes, postsRes, chatsRes] = await Promise.all([
      (sc === "all" || sc === "users")
        ? supabase.from("profiles").select("id, display_name, handle, avatar_url, is_verified").ilike("handle", `%${q}%`).limit(8)
        : Promise.resolve({ data: [] }),
      (sc === "all" || sc === "posts")
        ? supabase.from("posts").select("id, content, created_at, profiles!posts_user_id_fkey(handle)").ilike("content", `%${q}%`).limit(8)
        : Promise.resolve({ data: [] }),
      (sc === "all" || sc === "chats")
        ? supabase.from("group_chats").select("id, name, description").ilike("name", `%${q}%`).limit(6)
        : Promise.resolve({ data: [] }),
    ]);

    const mapped: Record<string, Result[]> = {};

    const userData = (usersRes.data || []).map((u: any) => ({
      type: "user" as const, id: u.id,
      title: u.display_name || `@${u.handle}`,
      subtitle: `@${u.handle}${u.is_verified ? " ✓" : ""}`,
      avatar: u.avatar_url,
      route: "/contact/[id]", params: { id: u.id },
    }));
    if (userData.length) mapped["People"] = userData;

    const postData = (postsRes.data || []).map((p: any) => ({
      type: "post" as const, id: p.id,
      title: p.content?.slice(0, 80) || "Post",
      subtitle: `by @${p.profiles?.handle || "user"} · ${new Date(p.created_at).toLocaleDateString()}`,
      route: "/post/[id]", params: { id: p.id },
    }));
    if (postData.length) mapped["Posts"] = postData;

    const chatData = (chatsRes.data || []).map((c: any) => ({
      type: "chat" as const, id: c.id,
      title: c.name || "Chat",
      subtitle: c.description || "Group chat",
      route: "/chat/[id]", params: { id: c.id },
    }));
    if (chatData.length) mapped["Chats"] = chatData;

    setResults(mapped);
    setLoading(false);
  }, []);

  function onChangeText(t: string) {
    setQuery(t);
    if (t.length >= 2) search(t, scope);
    else { setResults({}); setHasSearched(false); }
  }

  function saveRecent(q: string) {
    setRecents((prev) => {
      const updated = [q, ...prev.filter((r) => r !== q)].slice(0, MAX_RECENT);
      return updated;
    });
  }

  function onSubmit() {
    if (query.trim()) { saveRecent(query.trim()); search(query.trim(), scope); }
  }

  function tapRecent(r: string) {
    setQuery(r);
    search(r, scope);
  }

  const typeIcon = (type: string) => {
    const map: Record<string, string> = { user: "person", post: "newspaper-outline", chat: "chatbubbles-outline", file: "document-outline", link: "link-outline" };
    return (map[type] || "search-outline") as any;
  };

  const sections = Object.entries(results).map(([title, data]) => ({ title, data }));
  const totalCount = Object.values(results).reduce((a, b) => a + b.length, 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={[styles.searchBarWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 6 }}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.searchInput, { backgroundColor: colors.backgroundTertiary }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            autoFocus
            style={[styles.input, { color: colors.text }]}
            placeholder="Search users, posts, chats, files…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onChangeText}
            onSubmitEditing={onSubmit}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(""); setResults({}); setHasSearched(false); }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Scope tabs */}
      <View style={[styles.scopeRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={SCOPES}
          keyExtractor={(s) => s.key}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.scopePill, { backgroundColor: scope === item.key ? Colors.brand : colors.backgroundTertiary }]}
              onPress={() => { setScope(item.key); if (query.length >= 2) search(query, item.key); }}
            >
              <Ionicons name={item.icon as any} size={13} color={scope === item.key ? "#fff" : colors.textMuted} />
              <Text style={[styles.scopeText, { color: scope === item.key ? "#fff" : colors.textMuted }]}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.brand} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Searching…</Text>
        </View>
      ) : !hasSearched ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          {recents.length > 0 && (
            <>
              <View style={styles.recentHeader}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>Recent Searches</Text>
                <TouchableOpacity onPress={() => setRecents([])}>
                  <Text style={[styles.clearText, { color: Colors.brand }]}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recents.map((r) => (
                <TouchableOpacity key={r} style={[styles.recentRow, { backgroundColor: colors.surface }]} onPress={() => tapRecent(r)}>
                  <Ionicons name="time-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.recentText, { color: colors.text }]}>{r}</Text>
                  <TouchableOpacity onPress={() => setRecents((prev) => prev.filter((x) => x !== r))}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </>
          )}
          <View style={styles.hintBox}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.hintTitle, { color: colors.text }]}>Search everything</Text>
            <Text style={[styles.hintSub, { color: colors.textMuted }]}>Users, posts, groups, files, and links all in one place</Text>
          </View>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={56} color={colors.textMuted} />
          <Text style={[styles.hintTitle, { color: colors.text }]}>No results for "{query}"</Text>
          <Text style={[styles.hintSub, { color: colors.textMuted }]}>Try different keywords or change the filter</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{section.data.length} found</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.resultRow, { backgroundColor: colors.surface }]}
              onPress={() => {
                saveRecent(query);
                if (item.route) router.push({ pathname: item.route as any, params: item.params });
              }}
            >
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: Colors.brand + "18" }]}>
                  <Ionicons name={typeIcon(item.type)} size={20} color={Colors.brand} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                {item.subtitle && <Text style={[styles.resultSub, { color: colors.textMuted }]} numberOfLines={1}>{item.subtitle}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBarWrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  searchInput: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 12, height: 44, gap: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  scopeRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  scopePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  scopeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  hintBox: { alignItems: "center", paddingTop: 40, gap: 10 },
  hintTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  hintSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  clearText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, padding: 12, marginBottom: 6 },
  recentText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  sectionCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ffffff08" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
