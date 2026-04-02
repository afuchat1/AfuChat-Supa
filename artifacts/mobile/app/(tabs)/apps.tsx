import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "@/lib/haptics";
import { useTheme } from "@/hooks/useTheme";
import OfflineBanner from "@/components/ui/OfflineBanner";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const USAGE_KEY = "afu_app_usage";
const { width: SW } = Dimensions.get("window");
const TILE_WIDTH = Math.floor((SW - 16 * 2 - 12 * 2) / 4);

type AppItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
  route: string;
  badge?: string;
  featuredSub?: string;
};

type Category = {
  id: string;
  title: string;
  apps: AppItem[];
};

const CATEGORIES: Category[] = [
  {
    id: "ai",
    title: "Intelligence",
    apps: [
      {
        id: "afuai",
        label: "AfuAi",
        icon: "sparkles",
        gradient: ["#00BCD4", "#0097A7"],
        route: "/ai",
        badge: "AI",
        featuredSub: "Your intelligent assistant. Ask anything, do everything.",
      },
      {
        id: "search",
        label: "Search",
        icon: "search",
        gradient: ["#5856D6", "#6E6CD3"],
        route: "/search",
        featuredSub: "Find people, posts, channels, events and more.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    apps: [
      {
        id: "wallet",
        label: "Wallet",
        icon: "wallet",
        gradient: ["#00BCD4", "#26C6DA"],
        route: "/wallet",
        featuredSub: "Send, receive and manage your ACoins & Nexa.",
      },
      {
        id: "services",
        label: "Services",
        icon: "card",
        gradient: ["#AF52DE", "#BF5AF2"],
        route: "/mini-programs",
        featuredSub: "Pay bills, top up, and access local services.",
      },
      {
        id: "freelance",
        label: "Freelance",
        icon: "briefcase",
        gradient: ["#34C759", "#30D158"],
        route: "/freelance",
        badge: "NEW",
        featuredSub: "Hire talent or find work on AfuFreelance.",
      },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    apps: [
      {
        id: "games",
        label: "Games",
        icon: "game-controller",
        gradient: ["#007AFF", "#0A84FF"],
        route: "/games",
        featuredSub: "Play mini games and win ACoins.",
      },
      {
        id: "gifts",
        label: "Gifts",
        icon: "gift",
        gradient: ["#FF3B30", "#FF453A"],
        route: "/gifts",
        featuredSub: "Send animated gifts to people you love.",
      },
      {
        id: "shop",
        label: "Marketplace",
        icon: "storefront",
        gradient: ["#AF52DE", "#BF5AF2"],
        route: "/store",
        badge: "NEW",
        featuredSub: "Shop from verified organization stores.",
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    apps: [
      {
        id: "files",
        label: "Files",
        icon: "folder",
        gradient: ["#5856D6", "#6E6CD3"],
        route: "/file-manager",
        featuredSub: "Store and share your files securely.",
      },
      {
        id: "digitalid",
        label: "Digital ID",
        icon: "id-card",
        gradient: ["#1E3A5F", "#2C5282"],
        route: "/digital-id",
        badge: "3D",
        featuredSub: "Your verifiable digital identity card.",
      },
      {
        id: "saved",
        label: "Saved",
        icon: "bookmark",
        gradient: ["#FF6B35", "#FF8C00"],
        route: "/saved-posts",
        featuredSub: "All your bookmarked posts in one place.",
      },
      {
        id: "collections",
        label: "Collections",
        icon: "albums",
        gradient: ["#BF5AF2", "#AF52DE"],
        route: "/collections",
        featuredSub: "Curate and share themed collections.",
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    apps: [
      {
        id: "match",
        label: "AfuMatch",
        icon: "heart",
        gradient: ["#FF2D55", "#FF375F"],
        route: "/match",
        badge: "NEW",
        featuredSub: "Meet new people and find meaningful connections.",
      },
      {
        id: "events",
        label: "Events",
        icon: "calendar",
        gradient: ["#FF9500", "#FFCC00"],
        route: "/digital-events",
        featuredSub: "Discover local and online events near you.",
      },
      {
        id: "referral",
        label: "Referral",
        icon: "people",
        gradient: ["#34C759", "#00C781"],
        route: "/referral",
        featuredSub: "Invite friends and earn Nexa rewards.",
      },
      {
        id: "usernamemarket",
        label: "Usernames",
        icon: "at",
        gradient: ["#007AFF", "#5AC8FA"],
        route: "/username-market",
        featuredSub: "Buy and sell premium @handles.",
      },
    ],
  },
];

const ALL_APPS = CATEGORIES.flatMap((c) => c.apps);
const DEFAULT_FEATURED_ID = "afuai";

function AppTile({ app, onTap }: { app: AppItem; onTap: (id: string) => void }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    router.push(app.route as any);
  }

  return (
    <Animated.View style={{ transform: [{ scale }], alignItems: "center", width: TILE_WIDTH }}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.appTile}
      >
        <View style={styles.appIconWrapper}>
          <LinearGradient
            colors={app.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.appIcon}
          >
            <Ionicons name={app.icon} size={28} color="#fff" />
          </LinearGradient>
          {app.badge && (
            <View style={styles.appBadge}>
              <Text style={styles.appBadgeText}>{app.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.appLabel, { color: colors.textMuted }]} numberOfLines={1}>{app.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function FeaturedBanner({ app, onTap }: { app: AppItem; onTap: (id: string) => void }) {
  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    router.push(app.route as any);
  }
  return (
    <Pressable
      onPress={handlePress}
      style={{ marginHorizontal: 16, marginBottom: 20, borderRadius: 20, overflow: "hidden" }}
      android_ripple={{ color: "rgba(255,255,255,0.1)", borderless: false }}
    >
      <LinearGradient
        colors={[app.gradient[0], app.gradient[1], app.gradient[1] + "CC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredContent}>
          <View style={styles.featuredLeft}>
            <View style={styles.featuredIconWrap}>
              <Ionicons name={app.icon} size={32} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featuredTitle}>{app.label}</Text>
              <Text style={styles.featuredSub} numberOfLines={2}>
                {app.featuredSub ?? app.label}
              </Text>
            </View>
          </View>
          <View style={styles.featuredCta}>
            <Text style={styles.featuredCtaText}>Open</Text>
            <Ionicons name="arrow-forward" size={14} color={Colors.brand} />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function TrendingSection({
  apps,
  usageCounts,
  onTap,
  colors,
}: {
  apps: AppItem[];
  usageCounts: Record<string, number>;
  onTap: (id: string) => void;
  colors: any;
}) {
  if (apps.length === 0) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.textSecondary, letterSpacing: 0.5 }}>
          TRENDING
        </Text>
        <Text style={{ fontSize: 14 }}>🔥</Text>
      </View>
      <View style={[styles.categoryCard, { backgroundColor: colors.surface, marginHorizontal: 16 }]}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {apps.map((app) => (
            <View key={app.id} style={{ width: TILE_WIDTH, alignItems: "center" }}>
              <AppTileInner app={app} usageCount={usageCounts[app.id] ?? 0} onTap={onTap} colors={colors} />
            </View>
          ))}
          {apps.length % 4 !== 0 &&
            Array.from({ length: 4 - (apps.length % 4) }).map((_, i) => (
              <View key={`pad-${i}`} style={{ width: TILE_WIDTH }} />
            ))}
        </View>
      </View>
    </View>
  );
}

function AppTileInner({ app, usageCount, onTap, colors }: { app: AppItem; usageCount: number; onTap: (id: string) => void; colors: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    router.push(app.route as any);
  }
  return (
    <Animated.View style={{ transform: [{ scale }], alignItems: "center", width: TILE_WIDTH }}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.appTile}
      >
        <View style={styles.appIconWrapper}>
          <LinearGradient
            colors={app.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.appIcon}
          >
            <Ionicons name={app.icon} size={28} color="#fff" />
          </LinearGradient>
          {app.badge && (
            <View style={styles.appBadge}>
              <Text style={styles.appBadgeText}>{app.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.appLabel, { color: colors.textMuted }]} numberOfLines={1}>{app.label}</Text>
        {usageCount > 0 && (
          <Text style={{ fontSize: 9, color: colors.textMuted, fontFamily: "Inter_400Regular", marginTop: 1 }}>
            {usageCount > 99 ? "99+" : usageCount}x
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const { isPremium } = useAuth();

  useEffect(() => {
    AsyncStorage.getItem(USAGE_KEY).then((raw) => {
      if (raw) {
        try { setUsageCounts(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  function trackTap(appId: string) {
    setUsageCounts((prev) => {
      const updated = { ...prev, [appId]: (prev[appId] ?? 0) + 1 };
      AsyncStorage.setItem(USAGE_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  const trendingApps = [...ALL_APPS]
    .filter((a) => (usageCounts[a.id] ?? 0) > 0)
    .sort((a, b) => (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0))
    .slice(0, 4);

  const featuredApp =
    trendingApps[0] ??
    ALL_APPS.find((a) => a.id === DEFAULT_FEATURED_ID) ??
    ALL_APPS[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 72,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Apps</Text>
          {isPremium && (
            <View style={styles.premiumPill}>
              <Ionicons name="diamond" size={11} color="#FFD60A" />
              <Text style={styles.premiumPillText}>Premium</Text>
            </View>
          )}
        </View>

        <FeaturedBanner app={featuredApp} onTap={trackTap} />
        <TrendingSection
          apps={trendingApps}
          usageCounts={usageCounts}
          onTap={trackTap}
          colors={colors}
        />

        {CATEGORIES.map((cat) => (
          <View key={cat.id} style={styles.category}>
            <Text style={[styles.categoryTitle, { color: colors.textSecondary }]}>
              {cat.title.toUpperCase()}
            </Text>
            <View style={[styles.categoryCard, { backgroundColor: colors.surface }]}>
              <View style={styles.appGrid}>
                {cat.apps.map((app) => (
                  <AppTile key={app.id} app={app} onTap={trackTap} />
                ))}
                {cat.apps.length % 4 !== 0 &&
                  Array.from({ length: 4 - (cat.apps.length % 4) }).map((_, i) => (
                    <View key={`pad-${i}`} style={{ width: TILE_WIDTH }} />
                  ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 34,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1C1C1E",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  premiumPillText: {
    color: "#FFD60A",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  featuredGradient: {
    borderRadius: 20,
  },
  featuredContent: {
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  featuredLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    flex: 1,
  },
  featuredIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  featuredSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  featuredCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginLeft: 12,
  },
  featuredCtaText: {
    color: Colors.brand,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  category: {
    marginBottom: 8,
  },
  categoryTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  categoryCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 12,
  },
  appGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  appTile: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  appIconWrapper: {
    position: "relative",
    marginBottom: 6,
  },
  appIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  appBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  appBadgeText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
  appLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    maxWidth: 64,
  },
});
