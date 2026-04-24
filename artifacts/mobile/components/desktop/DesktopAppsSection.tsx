import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import type { DesktopSection } from "@/components/DesktopWrapper";
import { useDesktopTheme } from "./ui";

const BRAND = "#00BCD4";
const GOLD = "#D4A853";

type AppDef = {
  id: string;
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  gradient: [string, string];
  badge?: string;
  route?: string;
  section?: DesktopSection;
  adminOnly?: boolean;
  featured?: boolean;
};

type Category = {
  id: string;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  apps: AppDef[];
};

const CATEGORIES: Category[] = [
  {
    id: "intelligence",
    title: "Intelligence",
    icon: "sparkles",
    apps: [
      { id: "afuai",  label: "AfuAI",  sub: "Your intelligent assistant. Ask anything, get answers and actions.", icon: "sparkles", gradient: [BRAND, "#0097A7"], badge: "AI", section: "ai", featured: true },
      { id: "search", label: "Search", sub: "Find people, posts, channels, events and more.",                     icon: "search",   gradient: ["#5856D6", "#6E6CD3"],            route: "/search" },
    ],
  },
  {
    id: "social",
    title: "Social",
    icon: "people",
    apps: [
      { id: "match",    label: "AfuMatch",   sub: "Meet new people and find meaningful connections.",  icon: "heart",          gradient: ["#FF2D55", "#FF375F"], badge: "NEW", section: "match", featured: true },
      { id: "referral", label: "Referral",   sub: "Invite friends and earn Nexa rewards.",             icon: "people",         gradient: ["#34C759", "#00C781"],               route: "/referral" },
      { id: "events",   label: "Events",     sub: "Discover local and online events near you.",        icon: "calendar",       gradient: ["#FF9500", "#FFCC00"],               route: "/digital-events", adminOnly: true },
      { id: "paid-com", label: "Communities",sub: "Join paid communities and exclusive groups.",        icon: "people-circle",  gradient: ["#AF52DE", "#BF5AF2"],               route: "/paid-communities", adminOnly: true },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    icon: "game-controller",
    apps: [
      { id: "games",   label: "Games",   sub: "Play mini games and win ACoins.",                  icon: "game-controller", gradient: ["#007AFF", "#0A84FF"], route: "/games", featured: true },
      { id: "gifts",   label: "Gifts",   sub: "Send animated gifts to people you love.",          icon: "gift",            gradient: ["#FF3B30", "#FF453A"], route: "/gifts" },
      { id: "stories", label: "Stories", sub: "Share moments that disappear in 24 hours.",        icon: "aperture",        gradient: ["#FF9500", "#FF6B35"], route: "/stories/camera" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    icon: "wallet",
    apps: [
      { id: "wallet",    label: "Wallet",    sub: "Send, receive and manage your ACoins & Nexa.",  icon: "wallet",    gradient: [BRAND, "#26C6DA"], section: "wallet" as DesktopSection },
      { id: "services",  label: "Services",  sub: "Pay bills, top up, and access local services.",  icon: "card",      gradient: ["#AF52DE", "#BF5AF2"], route: "/mini-programs", adminOnly: true },
      { id: "freelance", label: "Freelance", sub: "Hire talent or find work on AfuFreelance.",      icon: "briefcase", gradient: ["#34C759", "#30D158"], badge: "NEW", route: "/freelance", adminOnly: true },
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: "storefront",
    apps: [
      { id: "shop",       label: "Marketplace", sub: "Shop from verified organization stores.", icon: "storefront", gradient: ["#FF2D55", "#FF6B35"], badge: "NEW", route: "/store", adminOnly: true },
      { id: "usernames",  label: "Usernames",   sub: "Buy and sell premium @handles.",          icon: "at",         gradient: ["#007AFF", "#5AC8FA"],               route: "/username-market", adminOnly: true },
      { id: "miniapps",   label: "Mini Apps",   sub: "Browse and publish lightweight mini apps.", icon: "grid",      gradient: [BRAND, "#0097A7"], badge: "NEW",   route: "/apps" },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    icon: "construct",
    apps: [
      { id: "digitalid",   label: "Digital ID",   sub: "Your verifiable digital identity card.", icon: "id-card",  gradient: ["#1E3A5F", "#2C5282"], badge: "3D", route: "/digital-id" },
      { id: "saved",       label: "Saved Posts",  sub: "All your bookmarked posts in one place.", icon: "bookmark", gradient: ["#FF6B35", "#FF8C00"],          route: "/saved-posts" },
      { id: "collections", label: "Collections",  sub: "Curate and share themed collections.",   icon: "albums",   gradient: ["#BF5AF2", "#AF52DE"],          route: "/collections", adminOnly: true },
      { id: "files",       label: "File Manager", sub: "Store and share your files securely.",   icon: "folder",   gradient: ["#5856D6", "#6E6CD3"],          route: "/file-manager", adminOnly: true },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: "person",
    apps: [
      { id: "premium",      label: "Premium",      sub: "Unlock exclusive features with AfuChat Premium.", icon: "star",   gradient: [GOLD, "#C89A3E"], badge: "PRO", route: "/premium", featured: true },
      { id: "prestige",     label: "Prestige",     sub: "Earn and showcase your community standing.",      icon: "ribbon", gradient: ["#AF52DE", "#9B59B6"],            route: "/prestige" },
      { id: "achievements", label: "Achievements", sub: "Track your milestones and earn badges.",         icon: "trophy", gradient: ["#FF9500", "#FFB300"],            route: "/achievements" },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradFor(app: AppDef, accent: string): [string, string] {
  return app.gradient.map((c) => (c === BRAND ? accent : c)) as [string, string];
}

// ─── Featured hero banner ────────────────────────────────────────────────────

function FeaturedBanner({
  app,
  colors,
  accent,
  onPress,
}: {
  app: AppDef;
  colors: any;
  accent: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.92}
      style={[
        styles.banner,
        { borderColor: colors.border },
        hovered && { transform: [{ translateY: -2 }] },
      ]}
      {...(hoverProps as any)}
    >
      <LinearGradient
        colors={gradFor(app, accent)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject as any}
      />
      <View style={styles.bannerOverlay} />
      <View style={styles.bannerContent}>
        <View style={styles.bannerIconWrap}>
          <Ionicons name={app.icon} size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.bannerTitle}>{app.label}</Text>
            {!!app.badge && (
              <View style={styles.bannerBadge}>
                <Text style={styles.bannerBadgeText}>{app.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.bannerSub} numberOfLines={2}>
            {app.sub}
          </Text>
        </View>
        <View style={styles.bannerCta}>
          <Text style={styles.bannerCtaText}>Open</Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── App tile ────────────────────────────────────────────────────────────────

function AppTile({
  app,
  colors,
  accent,
  onPress,
}: {
  app: AppDef;
  colors: any;
  accent: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      style={[
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: hovered ? accent + "55" : colors.border,
        },
        hovered && Platform.OS === "web" && ({ transform: [{ translateY: -2 }] } as any),
      ]}
      {...(hoverProps as any)}
    >
      <LinearGradient
        colors={gradFor(app, accent)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tileIcon}
      >
        <Ionicons name={app.icon} size={20} color="#fff" />
      </LinearGradient>

      <View style={styles.tileMeta}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
            {app.label}
          </Text>
          {!!app.badge && (
            <View style={[styles.tileBadge, { backgroundColor: accent + "1F" }]}>
              <Text style={[styles.tileBadgeText, { color: accent }]}>{app.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.tileSub, { color: colors.textMuted }]} numberOfLines={2}>
          {app.sub}
        </Text>
      </View>

      <View
        style={[
          styles.tileArrow,
          { backgroundColor: hovered ? accent : colors.text + "08" },
        ]}
      >
        <Ionicons
          name="arrow-forward"
          size={13}
          color={hovered ? "#fff" : colors.textMuted}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Category block ──────────────────────────────────────────────────────────

function CategoryBlock({
  cat,
  colors,
  accent,
  onNavigate,
  isAdmin,
}: {
  cat: Category;
  colors: any;
  accent: string;
  onNavigate: (section: DesktopSection) => void;
  isAdmin: boolean;
}) {
  const visibleApps = cat.apps.filter((a) => !a.adminOnly || isAdmin);
  if (visibleApps.length === 0) return null;

  return (
    <View style={styles.catBlock}>
      <View style={styles.catHeader}>
        <View style={[styles.catIconWrap, { backgroundColor: accent + "16" }]}>
          <Ionicons name={cat.icon} size={14} color={accent} />
        </View>
        <Text style={[styles.catTitle, { color: colors.text }]}>{cat.title}</Text>
        <View style={[styles.catCount, { backgroundColor: colors.text + "08" }]}>
          <Text style={[styles.catCountText, { color: colors.textMuted }]}>
            {visibleApps.length}
          </Text>
        </View>
      </View>
      <View style={styles.tileGrid}>
        {visibleApps.map((app) => (
          <View key={app.id} style={styles.tileCol}>
            <AppTile
              app={app}
              colors={colors}
              accent={accent}
              onPress={() => {
                if (app.section) onNavigate(app.section);
                else if (app.route) router.push(app.route as any);
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DesktopAppsSection({
  onNavigate,
}: {
  onNavigate: (section: DesktopSection) => void;
}) {
  const { colors, accent } = useTheme();
  const t = useDesktopTheme();
  const { profile } = useAuth();
  const isAdmin = (profile as any)?.is_admin ?? false;
  const [filter, setFilter] = useState("");

  const themedColors = useMemo(
    () => ({
      ...colors,
      background: t.contentBg,
      surface: t.panelBg,
      border: t.border,
      text: t.text,
      textMuted: t.textMuted,
    }),
    [colors, t],
  );

  const featured = useMemo(
    () =>
      CATEGORIES.flatMap((c) => c.apps)
        .filter((a) => a.featured && (!a.adminOnly || isAdmin))
        .slice(0, 3),
    [isAdmin],
  );

  const filteredCats = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      apps: c.apps.filter(
        (a) =>
          a.label.toLowerCase().includes(q) ||
          a.sub.toLowerCase().includes(q),
      ),
    })).filter((c) => c.apps.length > 0);
  }, [filter]);

  return (
    <View style={[styles.root, { backgroundColor: t.contentBg }]}>
      {/* Top section header */}
      <View style={[styles.pageHeader, { borderBottomColor: t.border, backgroundColor: t.panelHeaderBg }]}>
        <View style={styles.pageHeaderLeft}>
          <Text style={[styles.pageTitle, { color: t.text }]}>Apps</Text>
          <Text style={[styles.pageSub, { color: t.textMuted }]}>
            All your tools, services, and entertainment in one place
          </Text>
        </View>
        <View
          style={[
            styles.filterWrap,
            { backgroundColor: t.inputBg, borderColor: t.inputBorder },
          ]}
        >
          <Ionicons name="search" size={14} color={t.textMuted} />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filter apps"
            placeholderTextColor={t.textMuted}
            style={[styles.filterInput, { color: t.text }]}
          />
          {filter.length > 0 && (
            <TouchableOpacity onPress={() => setFilter("")} hitSlop={8}>
              <Ionicons name="close-circle" size={14} color={t.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured row */}
        {featured.length > 0 && filter.trim() === "" && (
          <View style={styles.featuredRow}>
            {featured.map((app) => (
              <View key={app.id} style={styles.featuredCol}>
                <FeaturedBanner
                  app={app}
                  colors={themedColors}
                  accent={accent}
                  onPress={() => {
                    if (app.section) onNavigate(app.section);
                    else if (app.route) router.push(app.route as any);
                  }}
                />
              </View>
            ))}
          </View>
        )}

        {/* Categories */}
        {filteredCats.map((cat) => (
          <CategoryBlock
            key={cat.id}
            cat={cat}
            colors={themedColors}
            accent={accent}
            onNavigate={onNavigate}
            isAdmin={isAdmin}
          />
        ))}

        {filteredCats.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={42} color={t.textMuted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>
              No apps match “{filter}”
            </Text>
            <Text style={[styles.emptySub, { color: t.textMuted }]}>
              Try a different keyword or clear the filter.
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create<any>({
  root: { flex: 1 },

  // Page header
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  pageHeaderLeft: { flex: 1, minWidth: 0 },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  pageSub: { fontSize: 13.5, fontFamily: "Inter_400Regular", marginTop: 4 },

  filterWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    width: 240,
    flexShrink: 0,
  },
  filterInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    outlineStyle: "none" as any,
    paddingVertical: 0,
  },

  scrollContent: { padding: 32, paddingTop: 24 },

  // Featured row
  featuredRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 32,
    flexWrap: "wrap",
  },
  featuredCol: { flex: 1, minWidth: 280 },

  banner: {
    height: 132,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  bannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
  },
  bannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: -0.2 },
  bannerSub: {
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.88)",
    marginTop: 4,
    lineHeight: 17,
  },
  bannerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  bannerBadgeText: { fontSize: 9.5, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.4 },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  bannerCtaText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // Category
  catBlock: { marginBottom: 28 },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 14,
  },
  catIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: { fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  catCount: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  catCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  // Tiles
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -7,
  },
  tileCol: {
    width: "33.3333%",
    paddingHorizontal: 7,
    paddingBottom: 12,
  },

  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tileMeta: { flex: 1, minWidth: 0 },
  tileLabel: { fontSize: 13.5, fontFamily: "Inter_600SemiBold", letterSpacing: -0.1 },
  tileSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
    lineHeight: 16,
  },

  tileBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  tileBadgeText: {
    fontSize: 9.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.4,
  },

  tileArrow: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
