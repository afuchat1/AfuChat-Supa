import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
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
import { useAuth } from "@/context/AuthContext";
import { GlassCard } from "@/components/ui/GlassCard";

const USAGE_KEY = "afu_app_usage";
const COLS = 4;
const H_PAD = 16;
const CARD_PAD = 8;

type AppItem = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
  route: string;
  badge?: string;
  featuredSub?: string;
  adminOnly?: boolean;
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
      {
        id: "lab",
        label: "AI Lens",
        icon: "scan",
        gradient: ["#FF6B35", "#FF3B00"],
        route: "/lab",
        badge: "NEW",
        featuredSub: "Point your camera at anything and get instant AI-powered answers.",
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
        adminOnly: true,
      },
      {
        id: "freelance",
        label: "Freelance",
        icon: "briefcase",
        gradient: ["#34C759", "#30D158"],
        route: "/freelance",
        badge: "NEW",
        featuredSub: "Hire talent or find work on AfuFreelance.",
        adminOnly: true,
      },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    apps: [
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
        adminOnly: true,
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    apps: [
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
        id: "qrscanner",
        label: "QR Scanner",
        icon: "qr-code",
        gradient: ["#1C1C1E", "#3A3A3C"],
        route: "/qr-scanner",
        featuredSub: "Scan any QR code — links, Wi-Fi, contacts and more.",
      },
      {
        id: "saved",
        label: "Saved",
        icon: "bookmark",
        gradient: ["#FF6B35", "#FF8C00"],
        route: "/saved-posts",
        featuredSub: "Saved posts, starred messages, and your collections.",
      },
      {
        id: "collections",
        label: "Collections",
        icon: "albums",
        gradient: ["#BF5AF2", "#AF52DE"],
        route: "/collections",
        featuredSub: "Curate and share themed collections.",
        adminOnly: true,
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
        adminOnly: true,
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

function resolveGradient(gradient: [string, string], accent: string): [string, string] {
  return gradient.map((c) => (c === "#00BCD4" ? accent : c)) as [string, string];
}

function AppTile({
  app,
  tileWidth,
  usageCount,
  onTap,
}: {
  app: AppItem;
  tileWidth: number;
  usageCount?: number;
  onTap: (id: string) => void;
}) {
  const { colors, accent } = useTheme();
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
    <Animated.View style={[{ transform: [{ scale }], width: tileWidth, alignItems: "center" }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.tilePressable}
      >
        <View style={styles.iconWrapper}>
          <LinearGradient
            colors={resolveGradient(app.gradient, accent)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name={app.icon} size={28} color="#fff" />
          </LinearGradient>
          {app.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{app.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {app.label}
        </Text>
        {usageCount && usageCount > 0 ? (
          <Text style={[styles.usageText, { color: colors.textMuted }]}>
            {usageCount > 99 ? "99+" : usageCount}
            {"x"}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function AppGrid({
  apps,
  tileWidth,
  usageCounts,
  onTap,
}: {
  apps: AppItem[];
  tileWidth: number;
  usageCounts: Record<string, number>;
  onTap: (id: string) => void;
}) {
  const padCount = apps.length % COLS === 0 ? 0 : COLS - (apps.length % COLS);
  return (
    <View style={styles.grid}>
      {apps.map((app) => (
        <AppTile
          key={app.id}
          app={app}
          tileWidth={tileWidth}
          usageCount={usageCounts[app.id]}
          onTap={onTap}
        />
      ))}
      {Array.from({ length: padCount }).map((_, i) => (
        <View key={"pad-" + i} style={{ width: tileWidth }} />
      ))}
    </View>
  );
}

function FeaturedBanner({ app, onTap }: { app: AppItem; onTap: (id: string) => void }) {
  const { colors, accent } = useTheme();

  function handlePress() {
    Haptics.selectionAsync();
    onTap(app.id);
    router.push(app.route as any);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.featuredCard, { marginHorizontal: H_PAD, marginBottom: 20 }]}
      android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: false }}
    >
      <LinearGradient
        colors={resolveGradient(app.gradient, accent)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredTop}>
          <View style={styles.featuredIconWrap}>
            <Ionicons name={app.icon} size={30} color="#fff" />
          </View>
          {app.badge ? (
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>{app.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.featuredTitle}>{app.label}</Text>
        <Text style={styles.featuredSub} numberOfLines={2}>
          {app.featuredSub ?? app.label}
        </Text>
        <View style={styles.featuredCtaRow}>
          <Text style={styles.featuredCtaText}>Open</Text>
          <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.9)" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function TrendingSection({
  apps,
  tileWidth,
  usageCounts,
  onTap,
  colors,
}: {
  apps: AppItem[];
  tileWidth: number;
  usageCounts: Record<string, number>;
  onTap: (id: string) => void;
  colors: any;
}) {
  if (apps.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{"TRENDING"}</Text>
        <Text style={{ fontSize: 14 }}>{"🔥"}</Text>
      </View>
      <GlassCard style={[styles.categoryCard, { marginHorizontal: H_PAD }]} variant="medium">
        <AppGrid apps={apps} tileWidth={tileWidth} usageCounts={usageCounts} onTap={onTap} />
      </GlassCard>
    </View>
  );
}

export default function AppsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const { isPremium, profile } = useAuth();
  const isAdmin = !!profile?.is_admin;

  const tileWidth = Math.floor((SW - H_PAD * 2 - CARD_PAD * 2) / COLS);

  useEffect(() => {
    AsyncStorage.getItem(USAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setUsageCounts(JSON.parse(raw));
        } catch (_) {}
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

  const visibleApps = ALL_APPS.filter((a) => !a.adminOnly || isAdmin);

  const visibleCategories = CATEGORIES.map((cat) => ({
    ...cat,
    apps: cat.apps.filter((a) => !a.adminOnly || isAdmin),
  })).filter((cat) => cat.apps.length > 0);

  const trendingApps = [...visibleApps]
    .filter((a) => (usageCounts[a.id] ?? 0) > 0)
    .sort((a, b) => (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0))
    .slice(0, 4);

  const featuredApp =
    trendingApps[0] ??
    visibleApps.find((a) => a.id === DEFAULT_FEATURED_ID) ??
    visibleApps[0];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{"Apps"}</Text>
          {isPremium ? (
            <View style={[styles.premiumPill, { backgroundColor: colors.backgroundSecondary }]}>
              <Ionicons name="diamond" size={11} color="#FFD60A" />
              <Text style={styles.premiumPillText}>{"Premium"}</Text>
            </View>
          ) : null}
        </View>

        {featuredApp ? <FeaturedBanner app={featuredApp} onTap={trackTap} /> : null}

        <TrendingSection
          apps={trendingApps}
          tileWidth={tileWidth}
          usageCounts={usageCounts}
          onTap={trackTap}
          colors={colors}
        />

        {visibleCategories.map((cat) => (
          <View key={cat.id} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, paddingHorizontal: H_PAD }]}>
              {cat.title.toUpperCase()}
            </Text>
            <GlassCard style={[styles.categoryCard, { marginHorizontal: H_PAD }]} variant="medium">
              <AppGrid
                apps={cat.apps}
                tileWidth={tileWidth}
                usageCounts={usageCounts}
                onTap={trackTap}
              />
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  premiumPillText: {
    color: "#FFD60A",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  featuredCard: {
    borderRadius: 20,
    overflow: "hidden",
  },
  featuredGradient: {
    padding: 20,
    paddingBottom: 16,
  },
  featuredTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  featuredIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  featuredBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  featuredTitle: {
    color: "#fff",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  featuredSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 14,
  },
  featuredCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  featuredCtaText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: H_PAD,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  categoryCard: {
    borderRadius: 20,
    overflow: "hidden",
    paddingVertical: 4,
    paddingHorizontal: CARD_PAD,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tilePressable: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    width: "100%",
  },
  iconWrapper: {
    position: "relative",
    marginBottom: 6,
  },
  iconGradient: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 8,
    fontFamily: "Inter_700Bold",
  },
  tileLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    maxWidth: 62,
  },
  usageText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});
