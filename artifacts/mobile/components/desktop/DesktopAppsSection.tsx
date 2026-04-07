import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import type { DesktopSection } from "@/components/DesktopWrapper";

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
};

type Category = { id: string; title: string; icon: React.ComponentProps<typeof Ionicons>["name"]; apps: AppDef[] };

const CATEGORIES: Category[] = [
  {
    id: "intelligence",
    title: "Intelligence",
    icon: "sparkles",
    apps: [
      { id: "afuai",  label: "AfuAI",      sub: "Your intelligent assistant. Ask anything, do everything.",   icon: "sparkles",        gradient: [BRAND, "#0097A7"],   badge: "AI",  section: "ai" },
      { id: "search", label: "Search",      sub: "Find people, posts, channels, events and more.",              icon: "search",          gradient: ["#5856D6","#6E6CD3"],              route: "/search" },
    ],
  },
  {
    id: "social",
    title: "Social",
    icon: "people",
    apps: [
      { id: "match",    label: "AfuMatch",   sub: "Meet new people and find meaningful connections.",            icon: "heart",           gradient: ["#FF2D55","#FF375F"],badge: "NEW", section: "match" },
      { id: "referral", label: "Referral",   sub: "Invite friends and earn Nexa rewards.",                      icon: "people",          gradient: ["#34C759","#00C781"],              route: "/referral" },
      { id: "events",   label: "Events",     sub: "Discover local and online events near you.",                  icon: "calendar",        gradient: ["#FF9500","#FFCC00"],              route: "/digital-events", adminOnly: true },
      { id: "paid-com", label: "Communities",sub: "Join paid communities and exclusive groups.",                  icon: "people-circle",   gradient: ["#AF52DE","#BF5AF2"],              route: "/paid-communities", adminOnly: true },
    ],
  },
  {
    id: "entertainment",
    title: "Entertainment",
    icon: "game-controller",
    apps: [
      { id: "games",   label: "Games",       sub: "Play mini games and win ACoins.",                            icon: "game-controller", gradient: ["#007AFF","#0A84FF"],              route: "/games" },
      { id: "gifts",   label: "Gifts",       sub: "Send animated gifts to people you love.",                    icon: "gift",            gradient: ["#FF3B30","#FF453A"],              route: "/gifts" },
      { id: "stories", label: "Stories",     sub: "Share moments that disappear in 24 hours.",                  icon: "aperture",        gradient: ["#FF9500","#FF6B35"],              route: "/stories/camera" },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    icon: "wallet",
    apps: [
      { id: "wallet",    label: "Wallet",    sub: "Send, receive and manage your ACoins & Nexa.",               icon: "wallet",          gradient: [BRAND,"#26C6DA"],                  section: "wallet" as DesktopSection },
      { id: "services",  label: "Services",  sub: "Pay bills, top up, and access local services.",               icon: "card",            gradient: ["#AF52DE","#BF5AF2"],              route: "/mini-programs", adminOnly: true },
      { id: "freelance", label: "Freelance", sub: "Hire talent or find work on AfuFreelance.",                  icon: "briefcase",       gradient: ["#34C759","#30D158"],badge: "NEW", route: "/freelance", adminOnly: true },
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    icon: "storefront",
    apps: [
      { id: "shop",      label: "Marketplace",    sub: "Shop from verified organization stores.",                icon: "storefront",      gradient: ["#FF2D55","#FF6B35"],badge: "NEW", route: "/store", adminOnly: true },
      { id: "usernames", label: "Usernames",      sub: "Buy and sell premium @handles.",                        icon: "at",              gradient: ["#007AFF","#5AC8FA"],              route: "/username-market", adminOnly: true },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    icon: "construct",
    apps: [
      { id: "digitalid",   label: "Digital ID",  sub: "Your verifiable digital identity card.",                 icon: "id-card",         gradient: ["#1E3A5F","#2C5282"],badge: "3D",  route: "/digital-id" },
      { id: "saved",       label: "Saved Posts", sub: "All your bookmarked posts in one place.",                 icon: "bookmark",        gradient: ["#FF6B35","#FF8C00"],              route: "/saved-posts" },
      { id: "collections", label: "Collections", sub: "Curate and share themed collections.",                   icon: "albums",          gradient: ["#BF5AF2","#AF52DE"],              route: "/collections", adminOnly: true },
      { id: "files",       label: "File Manager",sub: "Store and share your files securely.",                   icon: "folder",          gradient: ["#5856D6","#6E6CD3"],              route: "/file-manager", adminOnly: true },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: "person",
    apps: [
      { id: "premium",      label: "Premium",      sub: "Unlock exclusive features with AfuChat Premium.",      icon: "star",            gradient: [GOLD,"#C89A3E"],    badge: "⭐",   route: "/premium" },
      { id: "prestige",     label: "Prestige",     sub: "Earn and showcase your community standing.",           icon: "ribbon",          gradient: ["#AF52DE","#9B59B6"],              route: "/prestige" },
      { id: "achievements", label: "Achievements", sub: "Track your milestones and earn badges.",               icon: "trophy",          gradient: ["#FF9500","#FFB300"],              route: "/achievements" },
    ],
  },
];

// ─── App Tile ─────────────────────────────────────────────────────────────────

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

  const grad: [string, string] = app.gradient.map((c) =>
    c === BRAND ? accent : c
  ) as [string, string];

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.tile,
        { backgroundColor: colors.surface, borderColor: hovered ? accent + "50" : colors.border },
        hovered && { shadowOpacity: 0.12 },
      ]}
      {...(hoverProps as any)}
    >
      <LinearGradient colors={grad} style={styles.tileIcon} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Ionicons name={app.icon} size={24} color="#fff" />
      </LinearGradient>
      <View style={styles.tileMeta}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={1}>
            {app.label}
          </Text>
          {!!app.badge && (
            <View style={[styles.badge, { backgroundColor: accent + "20" }]}>
              <Text style={[styles.badgeText, { color: accent }]}>{app.badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.tileSub, { color: colors.textMuted }]} numberOfLines={2}>
          {app.sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

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
        <View style={[styles.catIconWrap, { backgroundColor: accent + "18" }]}>
          <Ionicons name={cat.icon} size={15} color={accent} />
        </View>
        <Text style={[styles.catTitle, { color: colors.text }]}>{cat.title}</Text>
      </View>
      <View style={styles.tileGrid}>
        {visibleApps.map((app) => (
          <AppTile
            key={app.id}
            app={app}
            colors={colors}
            accent={accent}
            onPress={() => {
              if (app.section) onNavigate(app.section);
              else if (app.route) router.push(app.route as any);
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Left sidebar nav ─────────────────────────────────────────────────────────

function SideNav({
  active,
  onSelect,
  colors,
  accent,
  isAdmin,
}: {
  active: string;
  onSelect: (id: string) => void;
  colors: any;
  accent: string;
  isAdmin: boolean;
}) {
  const visible = CATEGORIES.filter(
    (c) => !c.apps.every((a) => a.adminOnly && !isAdmin)
  );

  return (
    <View style={[styles.sideNav, { borderRightColor: colors.border, backgroundColor: colors.surface }]}>
      <Text style={[styles.sideTitle, { color: colors.textMuted }]}>Categories</Text>
      {visible.map((cat) => {
        const isActive = cat.id === active;
        return (
          <TouchableOpacity
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.8}
            style={[
              styles.sideItem,
              isActive && { backgroundColor: accent + "14" },
            ]}
          >
            <View style={[styles.sideIconWrap, isActive && { backgroundColor: accent + "20" }]}>
              <Ionicons name={cat.icon} size={15} color={isActive ? accent : colors.textMuted} />
            </View>
            <Text style={[styles.sideLabel, { color: isActive ? accent : colors.text, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium" }]}>
              {cat.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DesktopAppsSection({ onNavigate }: { onNavigate: (section: DesktopSection) => void }) {
  const { colors, accent } = useTheme();
  const { profile } = useAuth();
  const isAdmin = (profile as any)?.is_admin ?? false;

  const [activeCat, setActiveCat] = useState("intelligence");
  const scrollRef = React.useRef<ScrollView>(null);

  const selectedCat = CATEGORIES.find((c) => c.id === activeCat);

  function handleScroll(id: string) {
    setActiveCat(id);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SideNav active={activeCat} onSelect={handleScroll} colors={colors} accent={accent} isAdmin={isAdmin} />

      <ScrollView
        ref={scrollRef}
        style={styles.main}
        contentContainerStyle={styles.mainContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.heroIcon, { backgroundColor: accent + "18" }]}>
            <Ionicons name="grid" size={28} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>AfuChat Apps</Text>
            <Text style={[styles.heroSub, { color: colors.textMuted }]}>
              All your tools, entertainment, and services in one place
            </Text>
          </View>
        </View>

        {/* All categories */}
        {CATEGORIES.map((cat) => (
          <CategoryBlock
            key={cat.id}
            cat={cat}
            colors={colors}
            accent={accent}
            onNavigate={onNavigate}
            isAdmin={isAdmin}
          />
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create<any>({
  root: { flex: 1, flexDirection: "row" },

  sideNav: {
    width: 200,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 8,
    flexShrink: 0,
  },
  sideTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    marginBottom: 2,
  },
  sideIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  sideLabel: { fontSize: 13.5 },

  main: { flex: 1 },
  mainContent: { padding: 24 },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: 14,
    borderBottomWidth: 0,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 3 },

  catBlock: { marginBottom: 28 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  catIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },

  tileGrid: { gap: 8 },

  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tileMeta: { flex: 1 },
  tileLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  tileSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 18 },

  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});
