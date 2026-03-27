import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
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
import { showAlert } from "@/lib/alert";

type UserCard = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  country: string | null;
  interests: string[];
  follower_count: number;
  is_following: boolean;
  mutual_count: number;
};

const INTEREST_TAGS = [
  "All", "Tech", "Art", "Music", "Gaming", "Sports", "Finance",
  "Travel", "Food", "Fashion", "Science", "Movies", "Books", "Fitness",
];

const SORT_OPTIONS = ["Recommended", "Newest", "Most Followed", "Nearby"];

export default function UserDiscoveryScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterest, setSelectedInterest] = useState("All");
  const [sortBy, setSortBy] = useState("Recommended");
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, country, interests")
      .neq("id", user?.id || "")
      .eq("onboarding_completed", true)
      .limit(30);

    if (selectedInterest !== "All") {
      query = query.contains("interests", [selectedInterest.toLowerCase()]);
    }

    if (sortBy === "Most Followed") query = query.order("follower_count", { ascending: false });
    else if (sortBy === "Newest") query = query.order("created_at", { ascending: false });
    else query = query.order("follower_count", { ascending: false });

    const { data } = await query;

    let followSet = new Set<string>();
    if (user) {
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      followSet = new Set((follows || []).map((f: any) => f.following_id));
    }

    setFollowing(followSet);
    setUsers((data || []).map((u: any) => ({
      id: u.id, display_name: u.display_name || `@${u.handle}`,
      handle: u.handle, avatar_url: u.avatar_url, bio: u.bio,
      is_verified: u.is_verified, country: u.country,
      interests: u.interests || [], follower_count: 0,
      is_following: followSet.has(u.id), mutual_count: 0,
    })));
    setLoading(false);
  }, [user, selectedInterest, sortBy]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function toggleFollow(targetUser: UserCard) {
    if (!user) { router.push("/(auth)/login"); return; }
    setFollowLoading(targetUser.id);
    const isFollowing = following.has(targetUser.id);

    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUser.id);
      await supabase.from("profiles").update({ follower_count: Math.max(0, targetUser.follower_count - 1) }).eq("id", targetUser.id);
      setFollowing((prev) => { const s = new Set(prev); s.delete(targetUser.id); return s; });
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, is_following: false, follower_count: u.follower_count - 1 } : u));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUser.id });
      await supabase.from("profiles").update({ follower_count: targetUser.follower_count + 1 }).eq("id", targetUser.id);
      setFollowing((prev) => new Set([...prev, targetUser.id]));
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, is_following: true, follower_count: u.follower_count + 1 } : u));
    }
    setFollowLoading(null);
  }

  function formatCount(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  const renderUserCard = ({ item }: { item: UserCard }) => (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <TouchableOpacity style={styles.cardMain} onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: Colors.brand + "30" }]}>
            <Text style={styles.avatarInitial}>{(item.display_name || "@")[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
            {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={Colors.brand} />}
          </View>
          <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.handle}</Text>
          {item.bio && <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={2}>{item.bio}</Text>}
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>{formatCount(item.follower_count)} followers</Text>
            {item.country && <Text style={[styles.metaText, { color: colors.textMuted }]}>· {item.country}</Text>}
          </View>
          {item.interests.slice(0, 4).map((tag) => (
            <View key={tag} style={[styles.interestTag, { backgroundColor: Colors.brand + "18" }]}>
              <Text style={[styles.interestTagText, { color: Colors.brand }]}>{tag}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.followBtn, { backgroundColor: following.has(item.id) ? colors.backgroundTertiary : Colors.brand }]}
        onPress={() => toggleFollow(item)}
        disabled={followLoading === item.id}
      >
        {followLoading === item.id
          ? <ActivityIndicator size="small" color={following.has(item.id) ? colors.textMuted : "#fff"} />
          : <Text style={[styles.followBtnText, { color: following.has(item.id) ? colors.textMuted : "#fff" }]}>
              {following.has(item.id) ? "Following" : "Follow"}
            </Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Find People</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Discover people by interest and activity</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/search" as any)} hitSlop={10}>
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Interest filter */}
      <View style={[{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          {INTEREST_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.interestFilter, { backgroundColor: selectedInterest === tag ? Colors.brand : colors.surface }]}
              onPress={() => setSelectedInterest(tag)}
            >
              <Text style={[styles.interestFilterText, { color: selectedInterest === tag ? "#fff" : colors.textMuted }]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.sortBtn, { borderColor: sortBy === opt ? Colors.brand : colors.border, backgroundColor: sortBy === opt ? Colors.brand + "15" : "transparent" }]}
              onPress={() => setSortBy(opt)}
            >
              <Text style={[styles.sortBtnText, { color: sortBy === opt ? Colors.brand : colors.textMuted }]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserCard}
          contentContainerStyle={{ gap: 8, padding: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No users found</Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>Try a different interest filter</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  interestFilter: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  interestFilterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sortBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  sortBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 16, padding: 14, gap: 12 },
  cardMain: { flexDirection: "row", gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.brand },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  displayName: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 6 },
  meta: { flexDirection: "row", gap: 6, marginBottom: 6 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  interestTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 5, alignSelf: "flex-start" },
  interestTagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  followBtn: { height: 38, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  followBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
