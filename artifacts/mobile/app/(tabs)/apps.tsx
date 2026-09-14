import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  TextInput,
} from "react-native";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeRouter } from "@/lib/navUtils";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "@/lib/haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const USAGE_KEY = "afu_app_usage";
const COLS = 4;
const H_PAD = 16;

type PlatformPage = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
  route: string;
  badge?: string;
  featuredSub?: string;
  orgOnly?: boolean;
  nativeOnly?: boolean;
};

type Category = {
  id: string;
  title: string;
  pages: PlatformPage[];
};

const CATEGORIES: Category[] = [
  {
    id: "core",
    title: "Core Platform",
    pages: [
      {
        id: "afupay",
         label: "Wallet",
        icon: "wallet",
        gradient: ["#34C759", "#00C781"],
         route: "/app/afupay",
         featuredSub: "Send, receive, top up and pay from one Wallet.",
      },
      {
        id: "afumarket",
        label: "AfuMarket",
        icon: "storefront",
        gradient: ["#AF52DE", "#BF5AF2"],
         route: "/app/afumarket",
        badge: "NEW",
        featuredSub: "Shop from verified stores and sellers.",
      },
      {
        id: "afugames",
        label: "AfuGames",
        icon: "game-controller",
        gradient: ["#FF3B30", "#FF6B35"],
         route: "/app/afugames",
        featuredSub: "Play mini games and compete with friends.",
      },
      {
        id: "afumusic",
        label: "Music",
        icon: "musical-notes",
        gradient: ["#19172F", "#F06451"],
        route: "/app/afumusic",
        badge: "NEW",
        nativeOnly: true,
        featuredSub: "Discover independent sounds and keep your library offline.",
      },
      {
        id: "afubusiness",
        label: "AfuBusiness",
        icon: "briefcase",
        gradient: ["#1C1C1E", "#3A3A3C"],
         route: "/app/afubusiness",
        orgOnly: true,
        featuredSub: "Tools and analytics for your business.",
      },
    ],
  },
  {
    id: "ai",
    title: "Intelligence",
    pages: [
      {
        id: "afusearch",
        label: "Search",
        icon: "search",
        gradient: ["#5856D6", "#6E6CD3"],
         route: "/app/afusearch",
        featuredSub: "Find people, posts, channels, events and more.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    pages: [
      {
        id: "afufreelance",
        label: "Freelance",
        icon: "briefcase",
        gradient: ["#34C759", "#30D158"],
         route: "/app/afufreelance",
        badge: "NEW",
        featuredSub: "Hire talent or find work on AfuFreelance.",
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    pages: [
      {
        id: "afufiles",
        label: "Files",
        icon: "folder",
        gradient: ["#5856D6", "#6E6CD3"],
         route: "/app/afufiles",
        featuredSub: "Browse your shared media and files in one place.",
      },
      {
        id: "afuqr",
        label: "QR Scanner",
        icon: "qr-code",
        gradient: ["#1C1C1E", "#3A3A3C"],
         route: "/app/afuqr",
        nativeOnly: true,
        featuredSub: "Scan links, Wi-Fi, contacts and more.",
      },
      {
        id: "afusaved",
        label: "Saved",
        icon: "bookmark",
        gradient: ["#FF6B35", "#FF8C00"],
         route: "/app/afusaved",
        featuredSub: "Keep saved posts and starred messages close.",
      },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    pages: [
      {
        id: "afugifts",
        label: "Gifts",
        icon: "gift",
        gradient: ["#FF3B30", "#FF453A"],
         route: "/app/afugifts",
        featuredSub: "Send animated gifts to people you love.",
      },
      {
        id: "afuevents",
        label: "Events",
        icon: "calendar",
        gradient: ["#FF9500", "#FFCC00"],
         route: "/app/afuevents",
        featuredSub: "Discover local and online events near you.",
      },
    ],
  },
  {
    id: "community",
    title: "Community",
    pages: [
      {
        id: "afumatch",
        label: "AfuMatch",
        icon: "heart",
        gradient: ["#FF2D55", "#FF375F"],
         route: "/app/afumatch",
        featuredSub: "Meet new people and find meaningful connections.",
      },
      {
        id: "afucollections",
        label: "Collections",
        icon: "albums",
        gradient: ["#BF5AF2", "#AF52DE"],
         route: "/app/afucollections",
        featuredSub: "Curate and share themed collections.",
      },
      {
        id: "afuusernames",
        label: "Handles",
        icon: "at",
        gradient: ["#007AFF", "#5AC8FA"],
         route: "/app/afuusernames",
        featuredSub: "Buy and sell premium @handles.",
      },
    ],
  },
];

const ALL_PAGES = CATEGORIES.flatMap((c) => c.pages);
const FEATURED_IDS = ["afupay", "afumarket", "afugames", "afumatch", "afufreelance"];

function resolveGradient(gradient: [string, string], accent: string): [string, string] {
  return gradient.map((c) => (c === "#1018D8" ? accent : c)) as [string, string];
}

function openPlatformPage(page: PlatformPage) {
  safeRouter.push(page.route as any);
}

function FeaturedPageCard({
  page,
  accent,
  onTap,
}: {
  page: PlatformPage;
  accent: string;
  onTap: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { t } = useLanguage();

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(page.id);
    openPlatformPage(page);
  }

  const [c0, c1] = resolveGradient(page.gradient, accent);

  return (
    <Animated.View style={{ transform: [{ scale }], marginRight: 12 }}>
      <Pressable onPress={handlePress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <LinearGradient colors={[c0, c1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featCard}>
          <View style={styles.featCardInner}>
            <View style={styles.featIconRing}>
            <Ionicons name={page.icon} size={28} color="#fff" />
            </View>
            {page.badge ? (
              <View style={styles.featBadge}>
                <Text style={styles.featBadgeText}>{t(page.badge)}</Text>
              </View>
            ) : null}
          </View>
            <Text
              style={styles.featLabel}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {t(page.label)}
            </Text>
          {page.featuredSub ? (
            <Text style={styles.featSub} numberOfLines={3}>{t(page.featuredSub)}</Text>
          ) : null}
          <View style={styles.featOpenBtn}>
            <Text style={styles.featOpenText}>{t("Open")}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function PageTile({
  page,
  tileWidth,
  usageCount,
  onTap,
}: {
  page: PlatformPage;
  tileWidth: number;
  usageCount?: number;
  onTap: (id: string) => void;
}) {
  const { colors, accent } = useTheme();
  const { t } = useLanguage();
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }
  function handlePress() {
    Haptics.selectionAsync();
    onTap(page.id);
    openPlatformPage(page);
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
            colors={resolveGradient(page.gradient, accent)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name={page.icon} size={26} color="#fff" />
          </LinearGradient>
          {page.badge ? (
            <View style={[styles.badge, page.badge === "AI" ? styles.badgeAI : page.badge === "NEW" ? styles.badgeNew : styles.badgeDefault]}>
              <Text style={styles.badgeText}>{t(page.badge)}</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.tileLabel, { color: colors.text, maxWidth: Math.min(110, tileWidth - 4) }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {t(page.label)}
        </Text>
        {usageCount && usageCount > 0 ? (
          <Text style={[styles.usageText, { color: colors.textMuted }]}>
            {usageCount > 99 ? "99+" : usageCount}{"x"}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default function AppsScreen() {
  const { colors, accent, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const { isPremium, profile } = useAuth();
  const isOrgVerified = !!profile?.is_organization_verified;

  const tileWidth = Math.floor((SW - H_PAD * 2) / COLS);

  useEffect(() => {
    AsyncStorage.getItem(USAGE_KEY).then((raw) => {
      if (raw) {
        try { setUsageCounts(JSON.parse(raw)); } catch (_) {}
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

  function isVisible(a: PlatformPage) {
    if (a.orgOnly && !isOrgVerified) return false;
    if (a.nativeOnly && Platform.OS === "web") return false;
    return true;
  }

  const featuredApps = FEATURED_IDS
    .map((id) => ALL_PAGES.find((a) => a.id === id))
    .filter((a): a is PlatformPage => !!a && isVisible(a));

  const filteredCategories = CATEGORIES.map((cat) => ({
    ...cat,
    pages: cat.pages.filter((a) => {
      if (!isVisible(a)) return false;
      if (!searchQuery) return true;
       return t(a.label).toLowerCase().includes(searchQuery.toLowerCase());
    }),
  })).filter((cat) => cat.pages.length > 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 100,
        }}
        bounces={false}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingHorizontal: H_PAD }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{t("Pages")}</Text>
            {isPremium ? (
              <View style={[styles.premiumPill, { backgroundColor: colors.backgroundSecondary }]}>
                <Ionicons name="diamond" size={11} color="#FFD60A" />
                <Text style={styles.premiumPillText}>{t("Premium")}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Search bar ── */}
        <View style={[styles.searchWrap, { paddingHorizontal: H_PAD, marginBottom: 20 }]}>
          <View style={[styles.searchBox, { backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)" }]}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={t("Search pages…")}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── Featured horizontal scroll ── */}
        {!searchQuery ? (
          <View style={{ marginBottom: 28 }}>
              <Text
                style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: H_PAD, marginBottom: 12 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
              {t("Featured")}
              </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              alwaysBounceHorizontal={false}
              contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 4 }}
              decelerationRate="fast"
              snapToInterval={172}
              snapToAlignment="start"
            >
              {featuredApps.map((page) => (
                <FeaturedPageCard
                  key={page.id}
                  page={page}
                  accent={accent}
                  onTap={trackTap}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* ── Category grids ── */}
        {filteredCategories.map((cat) => {
          const padCount = cat.pages.length % COLS === 0 ? 0 : COLS - (cat.pages.length % COLS);
          return (
            <View key={cat.id} style={{ marginBottom: 24 }}>
              <Text
                style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: H_PAD, marginBottom: 4 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t(cat.title)}
              </Text>
              <View style={[styles.grid, { paddingHorizontal: H_PAD }]}>
                {cat.pages.map((page) => (
                  <PageTile
                    key={page.id}
                    page={page}
                    tileWidth={tileWidth}
                    usageCount={usageCounts[page.id]}
                    onTap={trackTap}
                  />
                ))}
                {Array.from({ length: padCount }).map((_, i) => (
                  <View key={"pad-" + i} style={{ width: tileWidth }} />
                ))}
              </View>
            </View>
          );
        })}

        {filteredCategories.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search" size={40} color={colors.textMuted} />
            <Text
              style={[styles.emptyText, { color: colors.textMuted }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t("No pages match")} "{searchQuery}"
            </Text>
          </View>
        ) : null}
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
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  premiumPillText: { color: "#FFD60A", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  searchWrap: {},
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  /* Featured card */
  featCard: {
    width: 160,
    borderRadius: 20,
    padding: 16,
    justifyContent: "space-between",
    minHeight: 170,
  },
  featCardInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  featIconRing: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  featBadge: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  featBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  featLabel: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    lineHeight: 21,
    marginBottom: 4,
  },
  featSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
    flex: 1,
  },
  featOpenBtn: {
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  featOpenText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  /* Grid tile */
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tilePressable: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 2,
    width: "100%",
  },
  iconWrapper: { position: "relative", marginBottom: 8 },
  iconGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeAI: { backgroundColor: "#007AFF" },
  badgeNew: { backgroundColor: "#34C759" },
  badgeDefault: { backgroundColor: "#FF3B30" },
  badgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 14,
    minHeight: 28,
  },
  usageText: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 1 },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: H_PAD },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
