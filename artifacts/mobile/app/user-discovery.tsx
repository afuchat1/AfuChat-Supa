import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { ContactRowSkeleton } from "@/components/ui/Skeleton";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

type DiscoverUser = {
  id: string;
  display_name: string;
  handle: string;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean;
  is_organization_verified: boolean;
  country: string | null;
  interests: string[];
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_mutual: boolean;
  distance_km?: number;
  location_updated_at?: string | null;
  last_seen?: string | null;
  is_online?: boolean;
};

const INTEREST_TAGS = [
  { label: "All", icon: "apps-outline" },
  { label: "Tech", icon: "hardware-chip-outline" },
  { label: "Art", icon: "color-palette-outline" },
  { label: "Music", icon: "musical-notes-outline" },
  { label: "Gaming", icon: "game-controller-outline" },
  { label: "Sports", icon: "football-outline" },
  { label: "Finance", icon: "trending-up-outline" },
  { label: "Travel", icon: "airplane-outline" },
  { label: "Food", icon: "restaurant-outline" },
  { label: "Fashion", icon: "shirt-outline" },
  { label: "Science", icon: "flask-outline" },
  { label: "Fitness", icon: "barbell-outline" },
  { label: "Business", icon: "briefcase-outline" },
  { label: "Education", icon: "school-outline" },
] as const;

const RADIUS_OPTIONS = [
  { label: "1 km", value: 1 },
  { label: "5 km", value: 5 },
  { label: "10 km", value: 10 },
  { label: "25 km", value: 25 },
  { label: "50 km", value: 50 },
  { label: "100 km", value: 100 },
];

const SORT_OPTIONS = [
  { label: "Popular", value: "popular", icon: "flame-outline" },
  { label: "Newest", value: "newest", icon: "time-outline" },
  { label: "Active", value: "active", icon: "pulse-outline" },
] as const;

type SortOption = "popular" | "newest" | "active";

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function isRecentlyActive(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60_000;
}

function PulsingDot({ color, size = 10 }: { color: string; size?: number }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.5, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color + "44",
          transform: [{ scale: anim }],
          position: "absolute",
        }}
      />
      <View style={{ width: size * 0.65, height: size * 0.65, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function RadarAnimation({ color }: { color: string }) {
  const rings = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  useEffect(() => {
    const anims = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 500),
          Animated.timing(r, { toValue: 1, duration: 2200, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);
  return (
    <View style={styles.radarWrap}>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          style={[
            styles.radarRing,
            {
              borderColor: color,
              opacity: r.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.7, 0.3, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
            },
          ]}
        />
      ))}
      <View style={[styles.radarCore, { backgroundColor: color }]}>
        <Ionicons name="navigate" size={18} color="#fff" />
      </View>
    </View>
  );
}

function UserAvatar({
  uri,
  name,
  size,
  isOnline,
}: {
  uri: string | null;
  name: string;
  size: number;
  isOnline?: boolean;
}) {
  const { colors } = useTheme();
  const initial = (name || "?")[0].toUpperCase();
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <ExpoImage
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.accent + "28",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.accent, fontSize: size * 0.38, fontFamily: "Inter_700Bold" }}>
            {initial}
          </Text>
        </View>
      )}
      {isOnline && (
        <View
          style={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: size * 0.26,
            height: size * 0.26,
            borderRadius: size * 0.13,
            borderWidth: 2,
            borderColor: colors.background,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PulsingDot color="#4CAF50" size={size * 0.22} />
        </View>
      )}
    </View>
  );
}

export default function UserDiscoveryScreen() {
  const { colors, accent } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"discover" | "nearby">("discover");
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [filtered, setFiltered] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("popular");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const channelRef = useRef<any>(null);
  const searchRef = useRef<TextInput>(null);
  const tabIndicator = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(tabIndicator, {
      toValue: tab === "discover" ? 0 : 1,
      useNativeDriver: false,
      tension: 120,
      friction: 10,
    }).start();
  }, [tab]);

  useEffect(() => {
    let result = [...users];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.display_name.toLowerCase().includes(q) ||
          u.handle.toLowerCase().includes(q) ||
          (u.bio || "").toLowerCase().includes(q) ||
          (u.country || "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "newest") {
      result = [...result].reverse();
    } else if (sortBy === "active") {
      result = [...result].sort((a, b) => {
        const aActive = a.last_seen ? new Date(a.last_seen).getTime() : 0;
        const bActive = b.last_seen ? new Date(b.last_seen).getTime() : 0;
        return bActive - aActive;
      });
    }
    setFiltered(result);
  }, [users, searchQuery, sortBy]);

  async function loadFollowSet(): Promise<Set<string>> {
    if (!user) return new Set();
    const { data } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", user.id);
    return new Set((data || []).map((f: any) => f.following_id));
  }

  const loadDiscoverUsers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select(
        "id, display_name, handle, avatar_url, bio, is_verified, is_organization_verified, country, interests, follower_count, following_count, last_seen"
      )
      .neq("id", user.id)
      .eq("onboarding_completed", true)
      .eq("is_banned", false)
      .eq("account_deleted", false)
      .order("follower_count", { ascending: false })
      .limit(60);

    if (selectedInterest !== "All") {
      query = query.contains("interests", [selectedInterest.toLowerCase()]);
    }

    const [{ data }, followSet] = await Promise.all([query, loadFollowSet()]);

    setFollowing(followSet);

    const mutualIds = new Set<string>();
    if (data && data.length > 0) {
      const ids = (data as any[]).map((u) => u.id);
      const { data: mutuals } = await supabase
        .from("follows")
        .select("follower_id")
        .in("follower_id", ids)
        .eq("following_id", user.id);
      (mutuals || []).forEach((m: any) => mutualIds.add(m.follower_id));
    }

    setUsers(
      ((data || []) as any[]).map((u) => ({
        id: u.id,
        display_name: u.display_name || `@${u.handle}`,
        handle: u.handle,
        avatar_url: u.avatar_url,
        bio: u.bio,
        is_verified: u.is_verified,
        is_organization_verified: u.is_organization_verified,
        country: u.country,
        interests: u.interests || [],
        follower_count: u.follower_count || 0,
        following_count: u.following_count || 0,
        is_following: followSet.has(u.id),
        is_mutual: followSet.has(u.id) && mutualIds.has(u.id),
        last_seen: u.last_seen,
        is_online: isRecentlyActive(u.last_seen),
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
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserCoords(coords);
      if (user) {
        await supabase
          .from("profiles")
          .update({
            latitude: coords.lat,
            longitude: coords.lng,
            location_updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }
    } catch {
      setNearbyError("Could not get your location. Please try again.");
    }
    setLocating(false);
  }, [user]);

  const loadNearbyUsers = useCallback(
    async (coords?: { lat: number; lng: number }) => {
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
          ((data || []) as any[]).map((u) => ({
            id: u.id,
            display_name: u.display_name || `@${u.handle}`,
            handle: u.handle,
            avatar_url: u.avatar_url,
            bio: u.bio,
            is_verified: u.is_verified,
            is_organization_verified: u.is_organization_verified ?? false,
            country: u.country,
            interests: u.interests || [],
            follower_count: u.follower_count || 0,
            following_count: u.following_count || 0,
            is_following: followSet.has(u.id),
            is_mutual: false,
            distance_km: u.distance_km,
            location_updated_at: u.location_updated_at,
            is_online: isRecentlyActive(u.location_updated_at),
          }))
        );
      }
      setLoading(false);
    },
    [user, userCoords, radiusKm]
  );

  useEffect(() => {
    if (tab === "discover") {
      loadDiscoverUsers();
    } else {
      if (!locationGranted) {
        setLoading(false);
        if (locationGranted === null) requestLocation();
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
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          (payload: any) => {
            if (payload.new?.latitude && payload.new?.longitude) {
              loadNearbyUsers(userCoords);
            }
          }
        )
        .subscribe();
    }
    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [userCoords, tab, radiusKm]);

  async function toggleFollow(targetUser: DiscoverUser) {
    if (!user) {
      router.push("/(auth)/login" as any);
      return;
    }
    setFollowLoading(targetUser.id);
    const isF = following.has(targetUser.id);
    if (isF) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", targetUser.id);
      setFollowing((prev) => {
        const s = new Set(prev);
        s.delete(targetUser.id);
        return s;
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, is_following: false, follower_count: Math.max(0, u.follower_count - 1) }
            : u
        )
      );
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetUser.id });
      setFollowing((prev) => new Set([...prev, targetUser.id]));
      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id
            ? { ...u, is_following: true, follower_count: u.follower_count + 1 }
            : u
        )
      );
    }
    setFollowLoading(null);
  }

  async function onRefresh() {
    setRefreshing(true);
    if (tab === "discover") await loadDiscoverUsers();
    else await loadNearbyUsers();
    setRefreshing(false);
  }

  const renderItem = useCallback(
    ({ item, index }: { item: DiscoverUser; index: number }) => (
      <UserRow
        item={item}
        index={index}
        isNearby={tab === "nearby"}
        following={following}
        followLoading={followLoading}
        onFollow={toggleFollow}
        accent={accent}
        colors={colors}
      />
    ),
    [tab, following, followLoading, accent, colors]
  );

  const renderDiscoverEmpty = () => (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: accent + "15" }]}>
        <Ionicons name="people-outline" size={44} color={accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {searchQuery ? "No results found" : "No users found"}
      </Text>
      <Text style={[styles.emptySub, { color: colors.textMuted }]}>
        {searchQuery
          ? `Try a different search term`
          : `Try a different interest filter`}
      </Text>
      {searchQuery ? (
        <TouchableOpacity
          style={[styles.emptyBtn, { backgroundColor: accent }]}
          onPress={() => setSearchQuery("")}
        >
          <Text style={styles.emptyBtnText}>Clear search</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const renderNearbyEmpty = () => {
    if (locationGranted === false) {
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconWrap, { backgroundColor: accent + "15" }]}>
            <Ionicons name="location-outline" size={44} color={accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            Location Access Needed
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Allow AfuChat to access your location to find people around you.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: accent }]}
            onPress={requestLocation}
          >
            <Ionicons name="location" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Allow Location</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (locating) {
      return (
        <View style={styles.emptyWrap}>
          <RadarAnimation color={accent} />
          <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 28 }]}>
            Finding your location…
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Scanning for AfuChat users nearby
          </Text>
        </View>
      );
    }
    if (nearbyError) {
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconWrap, { backgroundColor: "#FF3B3015" }]}>
            <Ionicons name="alert-circle-outline" size={44} color="#FF3B30" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>{nearbyError}</Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: accent }]}
            onPress={() => loadNearbyUsers()}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <RadarAnimation color={accent} />
        <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 28 }]}>
          No one nearby
        </Text>
        <Text style={[styles.emptySub, { color: colors.textMuted }]}>
          No AfuChat users found within {radiusKm} km. Try expanding your radius.
        </Text>
      </View>
    );
  };

  const tabW = useRef(0);
  const currentSort = SORT_OPTIONS.find((s) => s.value === sortBy)!;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top },
      ]}
    >
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Find People</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>
            {tab === "nearby" && userCoords
              ? `${users.length} user${users.length !== 1 ? "s" : ""} within ${radiusKm} km`
              : `${filtered.length} user${filtered.length !== 1 ? "s" : ""} discovered`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/search" as any)}
          hitSlop={10}
          style={styles.headerIcon}
        >
          <Ionicons name="search-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Tab Bar ── */}
      <View
        style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        onLayout={(e) => { tabW.current = e.nativeEvent.layout.width / 2; }}
      >
        {(["discover", "nearby"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={styles.tabItem}
            onPress={() => {
              setTab(t);
              if (t === "nearby" && !userCoords) requestLocation();
            }}
          >
            <Ionicons
              name={t === "discover" ? "compass-outline" : "navigate-outline"}
              size={15}
              color={tab === t ? accent : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: tab === t ? accent : colors.textMuted },
              ]}
            >
              {t === "discover" ? "Discover" : "Nearby"}
            </Text>
            {t === "nearby" && userCoords && tab === "nearby" && (
              <View style={[styles.livePill, { backgroundColor: "#4CAF50" }]}>
                <PulsingDot color="#fff" size={6} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <Animated.View
          style={[
            styles.tabUnderline,
            {
              backgroundColor: accent,
              transform: [
                {
                  translateX: tabIndicator.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, tabW.current],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      {/* ── Search Bar (discover only) ── */}
      {tab === "discover" && (
        <View
          style={[
            styles.searchWrap,
            {
              backgroundColor: colors.surface,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: colors.inputBg,
                borderColor: searchFocused ? accent : "transparent",
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={searchFocused ? accent : colors.textMuted}
            />
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search by name, handle, or interests…"
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Sort Button */}
          <TouchableOpacity
            style={[
              styles.sortBtn,
              { backgroundColor: colors.inputBg, borderColor: colors.border },
            ]}
            onPress={() => setShowSortMenu((v) => !v)}
          >
            <Ionicons name={currentSort.icon as any} size={15} color={accent} />
            <Text style={[styles.sortBtnText, { color: colors.text }]}>
              {currentSort.label}
            </Text>
            <Ionicons
              name={showSortMenu ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Sort Menu Dropdown ── */}
      {showSortMenu && tab === "discover" && (
        <View
          style={[
            styles.sortMenu,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              ...(Platform.OS !== "web" ? { shadowColor: "#000" } : {}),
            },
          ]}
        >
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.sortMenuItem,
                sortBy === opt.value && { backgroundColor: accent + "12" },
              ]}
              onPress={() => {
                setSortBy(opt.value);
                setShowSortMenu(false);
              }}
            >
              <Ionicons
                name={opt.icon as any}
                size={16}
                color={sortBy === opt.value ? accent : colors.textMuted}
              />
              <Text
                style={[
                  styles.sortMenuText,
                  { color: sortBy === opt.value ? accent : colors.text },
                ]}
              >
                {opt.label}
              </Text>
              {sortBy === opt.value && (
                <Ionicons name="checkmark" size={16} color={accent} style={{ marginLeft: "auto" }} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Filter Chips ── */}
      {tab === "discover" ? (
        <View style={[styles.chipsRow, { borderBottomColor: colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {INTEREST_TAGS.map((tag) => {
              const active = selectedInterest === tag.label;
              return (
                <TouchableOpacity
                  key={tag.label}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? accent : colors.inputBg,
                      borderColor: active ? accent : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedInterest(tag.label)}
                >
                  <Ionicons
                    name={tag.icon as any}
                    size={13}
                    color={active ? "#fff" : colors.textMuted}
                  />
                  <Text style={[styles.chipText, { color: active ? "#fff" : colors.textMuted }]}>
                    {tag.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View style={[styles.chipsRow, { borderBottomColor: colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {RADIUS_OPTIONS.map((opt) => {
              const active = radiusKm === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? accent : colors.inputBg,
                      borderColor: active ? accent : colors.border,
                    },
                  ]}
                  onPress={() => setRadiusKm(opt.value)}
                >
                  <Ionicons
                    name="navigate-circle-outline"
                    size={13}
                    color={active ? "#fff" : colors.textMuted}
                  />
                  <Text style={[styles.chipText, { color: active ? "#fff" : colors.textMuted }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {userCoords && (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: accent + "15", borderColor: accent + "40" }]}
                onPress={requestLocation}
              >
                <Ionicons name="refresh-outline" size={13} color={accent} />
                <Text style={[styles.chipText, { color: accent }]}>Refresh</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Content ── */}
      {loading && !refreshing ? (
        tab === "nearby" && locating ? (
          <View style={{ flex: 1 }}>
            <View style={styles.emptyWrap}>
              <RadarAnimation color={accent} />
              <Text style={[styles.emptyTitle, { color: colors.text, marginTop: 28 }]}>
                Finding your location…
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                Scanning for AfuChat users nearby
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ padding: 14, gap: 2 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <ContactRowSkeleton key={i} />
            ))}
          </View>
        )
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accent}
            />
          }
          ListEmptyComponent={
            tab === "nearby" ? renderNearbyEmpty() : renderDiscoverEmpty()
          }
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS === "android"}
        />
      )}
    </View>
  );
}

const UserRow = React.memo(function UserRow({
  item,
  index,
  isNearby,
  following,
  followLoading,
  onFollow,
  accent,
  colors,
}: {
  item: DiscoverUser;
  index: number;
  isNearby: boolean;
  following: Set<string>;
  followLoading: string | null;
  onFollow: (u: DiscoverUser) => void;
  accent: string;
  colors: any;
}) {
  const slideAnim = useRef(new Animated.Value(24)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index * 40, 300);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isFollowing = following.has(item.id);
  const isLoading = followLoading === item.id;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <Pressable
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
        onPress={() =>
          router.push({
            pathname: "/contact/[id]",
            params: {
              id: item.id,
              init_name: item.display_name,
              init_handle: item.handle,
              init_avatar: item.avatar_url ?? "",
            },
          })
        }
      >
        {/* Avatar */}
        <UserAvatar
          uri={item.avatar_url}
          name={item.display_name}
          size={52}
          isOnline={item.is_online}
        />

        {/* Info */}
        <View style={styles.rowInfo}>
          {/* Name + verified badge — always inline */}
          <View style={styles.nameRow}>
            <Text
              style={[styles.displayName, { color: colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.display_name}
            </Text>
            {(item.is_verified || item.is_organization_verified) && (
              <VerifiedBadge
                isVerified={item.is_verified}
                isOrganizationVerified={item.is_organization_verified}
                size={15}
              />
            )}
            {item.is_mutual && (
              <View style={[styles.mutualPill, { backgroundColor: accent + "18" }]}>
                <Ionicons name="people" size={9} color={accent} />
                <Text style={[styles.mutualText, { color: accent }]}>Mutual</Text>
              </View>
            )}
          </View>

          {/* Handle */}
          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
            @{item.handle}
            {item.country ? ` · ${item.country}` : ""}
          </Text>

          {/* Bio */}
          {item.bio ? (
            <Text
              style={[styles.bio, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {item.bio}
            </Text>
          ) : null}

          {/* Meta row */}
          <View style={styles.metaRow}>
            <Ionicons name="people-outline" size={11} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {formatCount(item.follower_count)} followers
            </Text>
            {isNearby && item.distance_km != null && (
              <>
                <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
                <Ionicons name="navigate-circle-outline" size={11} color={accent} />
                <Text style={[styles.metaText, { color: accent }]}>
                  {formatDistance(item.distance_km)}
                </Text>
              </>
            )}
            {isNearby && item.location_updated_at && !isNearby && (
              <>
                <View style={[styles.metaDot, { backgroundColor: colors.border }]} />
                <Text style={[styles.metaText, { color: colors.textMuted }]}>
                  {formatLastSeen(item.location_updated_at)}
                </Text>
              </>
            )}
          </View>

          {/* Interest tags */}
          {item.interests.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 5 }}
              contentContainerStyle={{ gap: 5 }}
            >
              {item.interests.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  style={[styles.interestTag, { backgroundColor: accent + "14" }]}
                >
                  <Text style={[styles.interestTagText, { color: accent }]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Follow Button */}
        <TouchableOpacity
          style={[
            styles.followBtn,
            isFollowing
              ? {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                }
              : { backgroundColor: accent },
          ]}
          onPress={() => onFollow(item)}
          disabled={isLoading}
          hitSlop={6}
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={isFollowing ? colors.textMuted : "#fff"}
            />
          ) : isFollowing ? (
            <Text style={[styles.followBtnText, { color: colors.textMuted }]}>
              Following
            </Text>
          ) : (
            <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
          )}
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerIcon: { padding: 4 },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
  },
  tabLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: "50%",
    height: 2,
    borderRadius: 2,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    marginLeft: 2,
  },
  liveText: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  sortMenu: {
    position: "absolute",
    right: 12,
    top: 168,
    zIndex: 100,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 4px 12px rgba(0,0,0,0.12)" } as any,
      default: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8 },
    }),
    minWidth: 160,
  },
  sortMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  sortMenuText: { fontSize: 14, fontFamily: "Inter_500Medium" },

  chipsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 7,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  listContent: {
    paddingBottom: 80,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, gap: 2 },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "nowrap",
  },
  displayName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  mutualPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
    marginLeft: 2,
  },
  mutualText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },

  handle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    flexWrap: "wrap",
  },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    marginHorizontal: 1,
  },

  interestTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  interestTagText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 82,
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    paddingTop: 60,
    gap: 10,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  radarWrap: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  radarCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
