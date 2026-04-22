import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import type { DesktopSection } from "./DesktopWrapper";

const afuSymbol = require("@/assets/images/afu-symbol.png");
const BRAND = "#00BCD4";

// ─── Live unread counts hook ────────────────────────────────────────────────

export function useUnreadCounts(userId: string | null) {
  const [notifCount, setNotifCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

  useEffect(() => {
    if (!userId) { setNotifCount(0); setChatCount(0); return; }

    const refreshNotif = () =>
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .then(({ count }) => setNotifCount(count ?? 0));

    const refreshChat = () =>
      supabase
        .from("chat_members")
        .select("unread_count")
        .eq("user_id", userId)
        .gt("unread_count", 0)
        .then(({ data }) => {
          const total = (data || []).reduce(
            (sum: number, r: any) => sum + (r.unread_count || 0),
            0,
          );
          setChatCount(total);
        });

    refreshNotif();
    refreshChat();

    const notifSub = supabase
      .channel(`nav-notifs-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => refreshNotif(),
      )
      .subscribe();

    const chatSub = supabase
      .channel(`nav-chats-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_members", filter: `user_id=eq.${userId}` },
        () => refreshChat(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifSub);
      supabase.removeChannel(chatSub);
    };
  }, [userId]);

  return { notifCount, chatCount };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItem = {
  key: DesktopSection | string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive?: React.ComponentProps<typeof Ionicons>["name"];
  section?: DesktopSection;
  route?: string;
  badge?: number;
  requiresAuth?: boolean;
  pill?: string;
  pillColor?: string;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

// ─── Sidebar nav row ─────────────────────────────────────────────────────────

function NavRow({
  item,
  active,
  colors,
  accent,
  onPress,
}: {
  item: NavItem;
  active: boolean;
  colors: any;
  accent: string;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  const bg = active ? accent + "16" : hovered ? colors.text + "08" : "transparent";
  const fg = active ? accent : colors.text;
  const iconName = active && item.iconActive ? item.iconActive : item.icon;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.navRow, { backgroundColor: bg }]}
      {...(hoverProps as any)}
    >
      {active && <View style={[styles.navActiveBar, { backgroundColor: accent }]} />}
      <Ionicons name={iconName} size={18} color={fg} />
      <Text
        style={[
          styles.navLabel,
          { color: fg, fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" },
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
      {item.pill ? (
        <View
          style={[
            styles.pill,
            { backgroundColor: (item.pillColor ?? accent) + "1F" },
          ]}
        >
          <Text style={[styles.pillText, { color: item.pillColor ?? accent }]}>
            {item.pill}
          </Text>
        </View>
      ) : null}
      {!!item.badge && item.badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: "#FF3B30" }]}>
          <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── User menu (popover) ─────────────────────────────────────────────────────

type MenuItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  section?: DesktopSection;
  route?: string;
  color?: string;
  divider?: boolean;
};

function buildUserMenu(isAdmin: boolean): MenuItem[] {
  const items: MenuItem[] = [
    { key: "profile",      label: "View profile",     icon: "person-circle-outline",  section: "profile" },
    { key: "edit",         label: "Edit profile",      icon: "create-outline",         route: "/profile/edit" },
    { key: "digitalid",    label: "Digital ID",        icon: "id-card-outline",        route: "/digital-id" },
    { key: "achievements", label: "Achievements",      icon: "trophy-outline",         route: "/achievements" },
    { key: "premium",      label: "Go Premium",        icon: "star-outline",           route: "/premium",     color: "#D4A853", divider: true },
    { key: "settings",     label: "Settings",          icon: "settings-outline",       section: "settings" },
  ];
  if (isAdmin) {
    items.push({ key: "admin", label: "Admin Panel", icon: "shield-checkmark-outline", route: "/admin", color: "#FF3B30" });
  }
  return items;
}

function UserMenuPopover({
  profile,
  colors,
  themeMode,
  onSection,
  onClose,
  onSignOut,
  cycleTheme,
}: {
  profile: any;
  colors: any;
  themeMode: string;
  onSection: (s: DesktopSection) => void;
  onClose: () => void;
  onSignOut: () => void;
  cycleTheme: () => void;
}) {
  const isAdmin = profile?.is_admin ?? false;
  const items = buildUserMenu(isAdmin);

  const themeLabel =
    themeMode === "dark" ? "Light theme" : themeMode === "light" ? "System theme" : "Dark theme";
  const themeIcon: React.ComponentProps<typeof Ionicons>["name"] =
    themeMode === "dark" ? "sunny-outline" : themeMode === "light" ? "contrast-outline" : "moon-outline";

  function handle(it: MenuItem) {
    onClose();
    if (it.section) onSection(it.section);
    else if (it.route) router.push(it.route as any);
  }

  return (
    <View style={[styles.userPopover, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.userPopoverHeader, { borderBottomColor: colors.border }]}>
        <Avatar
          uri={profile?.avatar_url ?? null}
          name={profile?.display_name || "?"}
          size={40}
          style={{ borderRadius: 10 }}
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.upName, { color: colors.text }]} numberOfLines={1}>
            {profile?.display_name || "User"}
          </Text>
          <Text style={[styles.upHandle, { color: colors.textMuted }]} numberOfLines={1}>
            @{profile?.handle || "user"}
          </Text>
        </View>
      </View>

      {items.map((it) => (
        <React.Fragment key={it.key}>
          {it.divider && <View style={[styles.popDivider, { backgroundColor: colors.border }]} />}
          <PopoverRow item={it} onPress={() => handle(it)} colors={colors} />
        </React.Fragment>
      ))}

      <View style={[styles.popDivider, { backgroundColor: colors.border }]} />

      <PopoverRow
        item={{ key: "theme", label: themeLabel, icon: themeIcon }}
        onPress={() => { onClose(); cycleTheme(); }}
        colors={colors}
      />

      <PopoverRow
        item={{ key: "out", label: "Sign out", icon: "log-out-outline", color: "#FF3B30" }}
        onPress={onSignOut}
        colors={colors}
      />
    </View>
  );
}

function PopoverRow({ item, onPress, colors }: { item: MenuItem; onPress: () => void; colors: any }) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};
  const fg = item.color ?? colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.popRow, hovered && { backgroundColor: colors.text + "08" }]}
      {...(hoverProps as any)}
    >
      <Ionicons name={item.icon} size={16} color={fg} style={{ width: 22 }} />
      <Text style={[styles.popLabel, { color: fg }]}>{item.label}</Text>
    </TouchableOpacity>
  );
}

// ─── Sidebar (main left rail) ────────────────────────────────────────────────

type SidebarProps = {
  activeSection: DesktopSection;
  onSectionChange: (s: DesktopSection) => void;
  hasSession: boolean;
};

export function DesktopSidebar({ activeSection, onSectionChange, hasSession }: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const { colors, accent, themeMode, setThemeMode } = useTheme();
  const { notifCount, chatCount } = useUnreadCounts(hasSession ? user?.id ?? null : null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const groups: NavGroup[] = [
    {
      items: [
        { key: "discover",      label: "Home",          icon: "home-outline",                iconActive: "home",                section: "discover" },
        { key: "search",        label: "Explore",       icon: "compass-outline",             iconActive: "compass",             section: "search" },
        { key: "chats",         label: "Messages",      icon: "chatbubbles-outline",         iconActive: "chatbubbles",         section: "chats",         requiresAuth: true, badge: chatCount },
        { key: "notifications", label: "Notifications", icon: "notifications-outline",       iconActive: "notifications",       section: "notifications", requiresAuth: true, badge: notifCount },
      ],
    },
    {
      title: "Workspace",
      items: [
        { key: "ai",       label: "AfuAI",     icon: "sparkles-outline",     iconActive: "sparkles",     section: "ai",       requiresAuth: true, pill: "AI" },
        { key: "match",    label: "AfuMatch",  icon: "heart-outline",        iconActive: "heart",        section: "match",    requiresAuth: true, pill: "NEW", pillColor: "#FF2D55" },
        { key: "wallet",   label: "Wallet",    icon: "wallet-outline",       iconActive: "wallet",       section: "wallet",   requiresAuth: true },
        { key: "contacts", label: "Contacts",  icon: "people-outline",       iconActive: "people",       section: "contacts", requiresAuth: true },
        { key: "apps",     label: "Apps",      icon: "grid-outline",         iconActive: "grid",         section: "apps" },
      ],
    },
    {
      title: "Library",
      items: [
        { key: "saved",   label: "Saved",      icon: "bookmark-outline",      iconActive: "bookmark",      route: "/saved-posts" },
        { key: "myposts", label: "My posts",   icon: "document-text-outline", iconActive: "document-text", route: "/my-posts" },
        { key: "store",   label: "Marketplace",icon: "storefront-outline",    iconActive: "storefront",    route: "/store" },
        { key: "games",   label: "Games",      icon: "game-controller-outline", iconActive: "game-controller", route: "/games" },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !it.requiresAuth || hasSession),
    }))
    .filter((g) => g.items.length > 0);

  const filteredGroups = search.trim()
    ? visibleGroups
        .map((g) => ({
          ...g,
          items: g.items.filter((it) =>
            it.label.toLowerCase().includes(search.trim().toLowerCase()),
          ),
        }))
        .filter((g) => g.items.length > 0)
    : visibleGroups;

  function handleNavPress(it: NavItem) {
    if (it.requiresAuth && !hasSession) {
      router.push("/(auth)/login" as any);
      return;
    }
    if (it.section) onSectionChange(it.section);
    else if (it.route) router.push(it.route as any);
  }

  function cycleTheme() {
    const next = themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  async function handleSignOut() {
    setUserMenuOpen(false);
    showAlert("Sign out?", "You'll need to log back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
      {/* Brand */}
      <TouchableOpacity
        onPress={() => onSectionChange("discover")}
        activeOpacity={0.85}
        style={styles.brand}
      >
        <View style={[styles.brandMark, { backgroundColor: accent }]}>
          <Image source={afuSymbol} style={styles.brandImg} resizeMode="contain" />
        </View>
        <Text style={[styles.brandText, { color: colors.text }]}>AfuChat</Text>
      </TouchableOpacity>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Ionicons name="search" size={14} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Compose */}
      {hasSession && (
        <TouchableOpacity
          onPress={() => router.push("/moments/create" as any)}
          activeOpacity={0.9}
          style={[styles.composeBtn, { backgroundColor: accent }]}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.composeText}>New post</Text>
        </TouchableOpacity>
      )}

      {/* Nav groups (scrollable) */}
      <View style={styles.navScroll}>
        {filteredGroups.map((group, idx) => (
          <View key={idx} style={{ marginTop: idx === 0 ? 4 : 14 }}>
            {!!group.title && (
              <Text style={[styles.groupTitle, { color: colors.textMuted }]}>{group.title}</Text>
            )}
            {group.items.map((it) => (
              <NavRow
                key={it.key}
                item={it}
                active={it.section === activeSection}
                colors={colors}
                accent={accent}
                onPress={() => handleNavPress(it)}
              />
            ))}
          </View>
        ))}
        {filteredGroups.length === 0 && (
          <Text style={[styles.emptySearch, { color: colors.textMuted }]}>
            No results for “{search}”
          </Text>
        )}
      </View>

      {/* Footer: user / auth */}
      <View style={[styles.sidebarFooter, { borderTopColor: colors.border }]}>
        {hasSession ? (
          <View style={{ position: "relative" }}>
            <TouchableOpacity
              onPress={() => setUserMenuOpen((v) => !v)}
              activeOpacity={0.85}
              style={[styles.userCard, { backgroundColor: userMenuOpen ? colors.text + "08" : "transparent" }]}
            >
              <Avatar
                uri={profile?.avatar_url ?? null}
                name={profile?.display_name || "?"}
                size={32}
                style={{ borderRadius: 8 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                  {profile?.display_name || "User"}
                </Text>
                <Text style={[styles.userHandle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{profile?.handle || "user"}
                </Text>
              </View>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textMuted} />
            </TouchableOpacity>

            {userMenuOpen && (
              <>
                <Pressable
                  style={{ position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                  onPress={() => setUserMenuOpen(false)}
                />
                <UserMenuPopover
                  profile={profile}
                  colors={colors}
                  themeMode={themeMode}
                  onSection={(s) => { setUserMenuOpen(false); onSectionChange(s); }}
                  onClose={() => setUserMenuOpen(false)}
                  onSignOut={handleSignOut}
                  cycleTheme={cycleTheme}
                />
              </>
            )}
          </View>
        ) : (
          <View style={styles.authBtns}>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/login" as any)}
              activeOpacity={0.85}
              style={[styles.loginBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.loginText, { color: colors.text }]}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(auth)/register" as any)}
              activeOpacity={0.9}
              style={[styles.signupBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.signupText}>Sign up free</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// Backwards-compat exports for any importers
export const DesktopTopNav = DesktopSidebar;
export const DesktopIconRail = DesktopSidebar;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create<any>({
  sidebar: {
    width: 260,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 14,
    flexShrink: 0,
    flexDirection: "column",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  brandImg: { width: 17, height: 17, tintColor: "#fff" },
  brandText: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    outlineStyle: "none" as any,
    paddingVertical: 0,
  },

  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
    borderRadius: 8,
    marginBottom: 6,
  },
  composeText: { color: "#fff", fontSize: 13.5, fontFamily: "Inter_600SemiBold" },

  navScroll: { flex: 1, marginTop: 4 },
  groupTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    marginBottom: 4,
    marginTop: 2,
  },

  navRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 12,
    paddingRight: 10,
    height: 34,
    borderRadius: 7,
    marginBottom: 1,
  },
  navActiveBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 2.5,
    borderRadius: 2,
  },
  navLabel: { flex: 1, fontSize: 13.5 },

  pill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  pillText: { fontSize: 9.5, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },

  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },

  emptySearch: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingTop: 12,
    fontFamily: "Inter_400Regular",
  },

  sidebarFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    marginTop: 8,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  userName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  userHandle: { fontSize: 11.5, fontFamily: "Inter_400Regular", marginTop: 1 },

  authBtns: { gap: 8, paddingHorizontal: 4, paddingTop: 4 },
  loginBtn: {
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  loginText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  signupBtn: {
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  signupText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Popover
  userPopover: {
    position: "absolute",
    bottom: 50,
    left: 0,
    width: 240,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 20,
  },
  userPopoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  upName: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  upHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  popRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 6,
  },
  popLabel: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  popDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
    marginVertical: 4,
  },
});
