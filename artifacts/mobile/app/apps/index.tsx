import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type MiniApp = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category: string;
  icon_url: string | null;
  open_count: number;
  status: string;
  author_id: string;
};

const FEATURED: MiniApp[] = [
  {
    id: "builtin-watch",
    slug: "watch",
    name: "Watch Together",
    tagline: "Live match rooms · chat & react in real time",
    category: "entertainment",
    icon_url: null,
    open_count: 0,
    status: "approved",
    author_id: "afuchat",
  },
  {
    id: "builtin-email",
    slug: "email",
    name: "AfuChat Mail",
    tagline: "Your AfuChat email at email.afuchat.com",
    category: "productivity",
    icon_url: null,
    open_count: 0,
    status: "approved",
    author_id: "afuchat",
  },
  {
    id: "builtin-ajs",
    slug: "ajs",
    name: "AJS Digital Services",
    tagline: "Digital services portal",
    category: "tools",
    icon_url: null,
    open_count: 0,
    status: "approved",
    author_id: "afuchat",
  },
];

const CATEGORIES = ["all", "utility", "social", "finance", "games", "education", "productivity", "entertainment", "tools", "other"] as const;

export default function MiniAppsHomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [tab, setTab] = useState<"browse" | "mine">("browse");
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [mine, setMine] = useState<MiniApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");

  const load = useCallback(async () => {
    const browseQ = supabase
      .from("mini_apps")
      .select("id,slug,name,tagline,category,icon_url,open_count,status,author_id")
      .eq("status", "approved")
      .order("open_count", { ascending: false })
      .limit(100);

    const minePromise = user
      ? supabase
          .from("mini_apps")
          .select("id,slug,name,tagline,category,icon_url,open_count,status,author_id")
          .eq("author_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null as any });

    const [browseRes, mineRes] = await Promise.all([browseQ, minePromise]);
    setApps((browseRes.data || []) as MiniApp[]);
    setMine((mineRes.data || []) as MiniApp[]);
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const merged = useMemo(() => {
    const slugs = new Set(apps.map((a) => a.slug));
    const all = [...FEATURED.filter((b) => !slugs.has(b.slug)), ...apps];
    let out = all;
    if (category !== "all") out = out.filter((a) => a.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (a) => a.name.toLowerCase().includes(q) || (a.tagline || "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [apps, category, query]);

  const list = tab === "browse" ? merged : mine;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Mini Apps</Text>
        <TouchableOpacity onPress={() => router.push("/apps/submit" as any)} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="add-circle-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        <Tab label="Browse" active={tab === "browse"} onPress={() => setTab("browse")} colors={colors} />
        <Tab label={`My Apps${mine.length ? ` (${mine.length})` : ""}`} active={tab === "mine"} onPress={() => setTab("mine")} colors={colors} />
      </View>

      {tab === "browse" && (
        <>
          <View style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search mini apps"
              placeholderTextColor={colors.textMuted}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>

          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={(c) => c}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setCategory(item)}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: category === item ? colors.accent : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: category === item ? "#fff" : colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="apps-outline" size={56} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", marginTop: 12 }}>
            {tab === "mine" ? "You haven't published any apps yet" : "No apps match your filter"}
          </Text>
          {tab === "mine" && (
            <TouchableOpacity
              onPress={() => router.push("/apps/submit" as any)}
              style={[styles.primaryBtn, { backgroundColor: colors.accent, marginTop: 16 }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Publish your first app</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => <AppCard app={item} colors={colors} mine={tab === "mine"} />}
        />
      )}
    </View>
  );
}

function Tab({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.tabBtn}>
      <Text style={{ color: active ? colors.accent : colors.textMuted, fontWeight: "600", fontSize: 14 }}>{label}</Text>
      {active && <View style={[styles.tabUnderline, { backgroundColor: colors.accent }]} />}
    </TouchableOpacity>
  );
}

function AppCard({ app, colors, mine }: { app: MiniApp; colors: any; mine: boolean }) {
  const initial = app.name.charAt(0).toUpperCase();
  const statusColor =
    app.status === "approved"
      ? "#22c55e"
      : app.status === "pending"
        ? "#f59e0b"
        : app.status === "rejected"
          ? "#ef4444"
          : colors.textMuted;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        if (app.slug === "watch") {
          router.push("/watch" as any);
        } else {
          router.push(`/apps/${app.slug}` as any);
        }
      }}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {app.icon_url ? (
        <Image source={{ uri: app.icon_url }} style={styles.icon} />
      ) : (
        <View style={[styles.icon, { backgroundColor: colors.accent + "22", alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 22 }}>{initial}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
          {app.name}
        </Text>
        {!!app.tagline && (
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
            {app.tagline}
          </Text>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.catPill, { backgroundColor: colors.background }]}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>
              {app.category}
            </Text>
          </View>
          {mine && (
            <View style={[styles.catPill, { backgroundColor: statusColor + "22" }]}>
              <Text style={{ color: statusColor, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>
                {app.status}
              </Text>
            </View>
          )}
          {app.open_count > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{app.open_count} opens</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", textAlign: "center" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  tabUnderline: { height: 2, marginTop: 6, width: 24, borderRadius: 2 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  catRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  icon: { width: 52, height: 52, borderRadius: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  primaryBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
});
