import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import Colors from "@/constants/colors";

type DiscoverUser = {
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
  distance_km?: number;
  location_updated_at?: string | null;
  last_seen?: string | null;
};

const INTEREST_TAGS = [
  "All", "Tech", "Art", "Music", "Gaming", "Sports",
  "Finance", "Travel", "Food", "Fashion", "Science", "Fitness",
];

const RADIUS_OPTIONS = [
  { label: "1 km", value: 1 },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "50 km", value: 50 },
];

function formatDistance(km: number): string {
  if (km < 0.1) return "< 100 m";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function RadarAnimation({ color }: { color: string }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = rings.map((ring, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 600),
          Animated.timing(ring, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.radarContainer}>
      {rings.map((ring, i) => (
        <Animated.View
          key={i}
          style={[
            styles.radarRing,
            {
              borderColor: color,
              opacity: ring.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.2, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
            },
          ]}
        />
      ))}
      <View style={[styles.radarDot, { backgroundColor: color }]}>
        <Ionicons name="navigate" size={16} color="#fff" />
      </View>
    </View>
  );
}

export default function UserDiscoveryScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"discover" | "nearby">("discover");
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState("All");
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const channelRef = useRef<any>(null);

  async function loadFollowSet(): Promise<Set<string>> {
    if (!user) return new Set();
    const { data } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
    return new Set((data || []).map((f: any) => f.following_id));
  }

  const loadDiscoverUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from("profiles")
      .select("id, display_name, handle, avatar_url, bio, is_verified, country, interests, follower_count, last_seen")
      .neq("id", user.id)
      .eq("onboarding_completed", true)
      .eq("is_banned", false)
      .eq("account_deleted", false)
      .order("follower_count", { ascending: false })
      .limit(40);

    if (selectedInterest !== "All") {
      query = query.contains("interests", [selectedInterest.toLowerCase()]);
    }

    const [{ data }, followSet] = await Promise.all([query, loadFollowSet()]);

    setFollowing(followSet);
    setUsers(
      (data || []).map((u: any) => ({
        id: u.id,
        display_name: u.display_name || `@${u.handle}`,
        handle: u.handle,
        avatar_url: u.avatar_url,
        bio: u.bio,
        is_verified: u.is_verified,
        country: u.country,
        interests: u.interests || [],
        follower_count: u.follower_count || 0,
        is_following: followSet.has(u.id),
        last_seen: u.last_seen,
      }))
    );
    setLoading(false);
  }, [user, selectedInterest]);

  const requestLocation = useCallback(async () => {
    setLocating(true);
    setNearbyError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationGranted(false);
        setLocating(false);
        return;
      }
      setLocationGranted(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserCoords(coords);

      if (user) {
        await supabase.from("profiles").update({
          latitude: coords.lat,
          longitude: coords.lng,
          location_updated_at: new Date().toISOString(),
        }).eq("id", user.id);
      }
    } catch {
      setNearbyError("Could not get your location. Please try again.");
    }
    setLocating(false);
  }, [user]);

  const loadNearbyUsers = useCallback(async (coords?: { lat: number; lng: number }) => {
    if (!user) return;
    const c = coords || userCoords;
    if (!c) return;
    setLoading(true);
    setNearbyError(null);

    const [{ data, error }, followSet] = await Promise.all([
      supabase.rpc("nearby_users", {
        user_lat: c.lat,
        user_lng: c.lng,
        radius_km: radiusKm,
        exclude_id: user.id,
      }),
      loadFollowSet(),
    ]);

    if (error) {
      setNearbyError("Failed to load nearby users.");
    } else {
      setFollowing(followSet);
      setUsers(
        (data || []).map((u: any) => ({
          id: u.id,
          display_name: u.display_name || `@${u.handle}`,
          handle: u.handle,
          avatar_url: u.avatar_url,
          bio: u.bio,
          is_verified: u.is_verified,
          country: u.country,
          interests: u.interests || [],
          follower_count: u.follower_count || 0,
          is_following: followSet.has(u.id),
          distance_km: u.distance_km,
          location_updated_at: u.location_updated_at,
        }))
      );
    }
    setLoading(false);
  }, [user, userCoords, radiusKm]);

  useEffect(() => {
    if (tab === "discover") {
      loadDiscoverUsers();
    } else {
      if (!locationGranted) {
        setLoading(false);
        if (locationGranted === null) requestLocation().then(() => {});
      } else if (userCoords) {
        loadNearbyUsers();
      }
    }
  }, [tab, selectedInterest, radiusKm]);

  useEffect(() => {
    if (tab === "nearby" && userCoords) {
      loadNearbyUsers(userCoords);
      channelRef.current?.unsubscribe();
      channelRef.current = supabase
        .channel("nearby-location-updates")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload: any) => {
          if (payload.new?.latitude && payload.new?.longitude) {
            loadNearbyUsers(userCoords);
          }
        })
        .subscribe();
    }
    return () => { channelRef.current?.unsubscribe(); };
  }, [userCoords, tab, radiusKm]);

  async function toggleFollow(targetUser: DiscoverUser) {
    if (!user) { router.push("/(auth)/login" as any); return; }
    setFollowLoading(targetUser.id);
    const isFollowing = following.has(targetUser.id);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetUser.id);
      setFollowing((prev) => { const s = new Set(prev); s.delete(targetUser.id); return s; });
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, is_following: false, follower_count: Math.max(0, u.follower_count - 1) } : u));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: targetUser.id });
      setFollowing((prev) => new Set([...prev, targetUser.id]));
      setUsers((prev) => prev.map((u) => u.id === targetUser.id ? { ...u, is_following: true, follower_count: u.follower_count + 1 } : u));
    }
    setFollowLoading(null);
  }

  async function onRefresh() {
    setRefreshing(true);
    if (tab === "discover") await loadDiscoverUsers();
    else await loadNearbyUsers();
    setRefreshing(false);
  }

  const renderUserCard = ({ item }: { item: DiscoverUser }) => {
    const isNearby = tab === "nearby";
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })}
        activeOpacity={0.92}
      >
        <View style={styles.cardRow}>
          <View style={styles.avatarWrap}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent + "22" }]}>
                <Text style={[styles.avatarInitial, { color: colors.accent }]}>{(item.display_name || "@")[0].toUpperCase()}</Text>
              </View>
            )}
            {isNearby && item.location_updated_at && (
              <View style={[styles.onlineDot, {
                backgroundColor: (Date.now() - new Date(item.location_updated_at).getTime()) < 5 * 60000
                  ? "#4CAF50" : "#FFC107"
              }]} />
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.displayName, { color: colors.text }]} numberOfLines={1}>{item.display_name}</Text>
              {item.is_verified && <Ionicons name="checkmark-circle" size={14} color={colors.accent} />}
            </View>
            <Text style={[styles.handle, { color: colors.textMuted }]}>@{item.handle}</Text>
            {item.bio ? (
              <Text style={[styles.bio, { color: colors.textSecondary }]} numberOfLines={2}>{item.bio}</Text>
            ) : null}

            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.metaText, { color: colors.textMuted }]}>{formatCount(item.follower_count)}</Text>
              {item.country ? (
                <>
                  <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{item.country}</Text>
                </>
              ) : null}
              {isNearby && item.location_updated_at ? (
                <>
                  <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
                  <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>{formatLastSeen(item.location_updated_at)}</Text>
                </>
              ) : null}
            </View>

            {item.interests.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {item.interests.slice(0, 5).map((tag) => (
                  <View key={tag} style={[styles.tag, { backgroundColor: colors.accent + "18" }]}>
                    <Text style={[styles.tagText, { color: colors.accent }]}>{tag}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        <View style={styles.cardFooter}>
          {isNearby && item.distance_km != null ? (
            <View style={[styles.distanceBadge, { backgroundColor: colors.accent + "18" }]}>
              <Ionicons name="navigate-circle-outline" size={13} color={colors.accent} />
              <Text style={[styles.distanceText, { color: colors.accent }]}>{formatDistance(item.distance_km)} away</Text>
            </View>
          ) : (
            <View />
          )}
          <TouchableOpacity
            style={[
              styles.followBtn,
              {
                backgroundColor: following.has(item.id) ? "transparent" : colors.accent,
                borderColor: following.has(item.id) ? colors.border : colors.accent,
              }
            ]}
            onPress={() => toggleFollow(item)}
            disabled={followLoading === item.id}
          >
            {followLoading === item.id ? (
              <ActivityIndicator size="small" color={following.has(item.id) ? colors.textMuted : "#fff"} />
            ) : (
              <Text style={[styles.followBtnText, { color: following.has(item.id) ? colors.textMuted : "#fff" }]}>
                {following.has(item.id) ? "Following" : "Follow"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderNearbyEmpty = () => {
    if (locationGranted === false) {
      return (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name="location-outline" size={36} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Location Access Needed</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Allow AfuChat to access your location to discover people around you.
          </Text>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={requestLocation}>
            <Text style={styles.actionBtnText}>Allow Location</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (locating) {
      return (
        <View style={styles.emptyState}>
          <RadarAnimation color={colors.accent} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 24 }]}>Finding your location…</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>Looking for AfuChat users nearby</Text>
        </View>
      );
    }
    if (nearbyError) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{nearbyError}</Text>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={() => loadNearbyUsers()}>
            <Text style={styles.actionBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <RadarAnimation color={colors.accent} />
        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 24 }]}>No one nearby</Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>
          No AfuChat users found within {radiusKm} km. Try expanding the radius.
        </Text>
      </View>
    );
  };

  const renderDiscoverEmpty = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={56} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No users found</Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>Try a different interest filter</Text>
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
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            {tab === "nearby" && userCoords
              ? `Within ${radiusKm} km · ${users.length} found`
              : "Discover by interests"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/search" as any)} hitSlop={10}>
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabItem, tab === "discover" && [styles.tabItemActive, { borderBottomColor: colors.accent }]]}
          onPress={() => setTab("discover")}
        >
          <Ionicons name="compass-outline" size={16} color={tab === "discover" ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === "discover" ? colors.accent : colors.textMuted }]}>Discover</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, tab === "nearby" && [styles.tabItemActive, { borderBottomColor: colors.accent }]]}
          onPress={() => {
            setTab("nearby");
            if (!userCoords) requestLocation();
          }}
        >
          <Ionicons name="navigate-outline" size={16} color={tab === "nearby" ? colors.accent : colors.textMuted} />
          <Text style={[styles.tabText, { color: tab === "nearby" ? colors.accent : colors.textMuted }]}>Nearby</Text>
          {tab === "nearby" && userCoords && (
            <View style={[styles.liveChip, { backgroundColor: "#4CAF50" }]}>
              <Text style={styles.liveChipText}>LIVE</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {tab === "discover" ? (
        <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            {INTEREST_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.chip, {
                  backgroundColor: selectedInterest === tag ? colors.accent : colors.surface,
                  borderColor: selectedInterest === tag ? colors.accent : colors.border,
                }]}
                onPress={() => setSelectedInterest(tag)}
              >
                <Text style={[styles.chipText, { color: selectedInterest === tag ? "#fff" : colors.textMuted }]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.filterRow, { borderBottomColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
            {RADIUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, {
                  backgroundColor: radiusKm === opt.value ? colors.accent : colors.surface,
                  borderColor: radiusKm === opt.value ? colors.accent : colors.border,
                }]}
                onPress={() => setRadiusKm(opt.value)}
              >
                <Ionicons name="navigate-circle-outline" size={13} color={radiusKm === opt.value ? "#fff" : colors.textMuted} />
                <Text style={[styles.chipText, { color: radiusKm === opt.value ? "#fff" : colors.textMuted }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            {userCoords && (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={requestLocation}
              >
                <Ionicons name="refresh-outline" size={13} color={colors.accent} />
                <Text style={[styles.chipText, { color: colors.accent }]}>Refresh</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {loading && !refreshing ? (
        tab === "nearby" && locating ? null : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        )
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUserCard}
          contentContainerStyle={{ gap: 10, padding: 14, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          ListEmptyComponent={tab === "nearby" ? renderNearbyEmpty() : renderDiscoverEmpty()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  tabBar: {
    flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  liveChip: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  liveChipText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
  filterRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: {
    borderRadius: 16, padding: 14, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  avatarWrap: { position: "relative" },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarPlaceholder: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.brand },
  onlineDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: "#fff",
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  displayName: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  handle: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  bio: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaDot: { fontSize: 12 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginRight: 5 },
  tagText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  distanceBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  distanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  followBtn: {
    height: 36, borderRadius: 20, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 20, borderWidth: 1,
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  actionBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  actionBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  radarContainer: { width: 100, height: 100, alignItems: "center", justifyContent: "center" },
  radarRing: { position: "absolute", width: 100, height: 100, borderRadius: 50, borderWidth: 2 },
  radarDot: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
