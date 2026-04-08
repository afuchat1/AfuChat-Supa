import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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

// ─── Live unread counts hook ─────────────────────────────────────────────────

function useUnreadCounts(userId: string | null) {
  const [notifCount, setNotifCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

  useEffect(() => {
    if (!userId) { setNotifCount(0); setChatCount(0); return; }

    // Fetch notification unread count
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .then(({ count }) => setNotifCount(count ?? 0));

    // Fetch chat unread count (chats with unread_count > 0)
    supabase
      .from("chat_members")
      .select("unread_count")
      .eq("user_id", userId)
      .gt("unread_count", 0)
      .then(({ data }) => {
        const total = (data || []).reduce((sum: number, r: any) => sum + (r.unread_count || 0), 0);
        setChatCount(total);
      });

    // Subscribe to new notifications
    const notifSub = supabase
      .channel(`nav-notifs-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false)
          .then(({ count }) => setNotifCount(count ?? 0));
      })
      .subscribe();

    // Subscribe to chat member changes
    const chatSub = supabase
      .channel(`nav-chats-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_members", filter: `user_id=eq.${userId}` }, () => {
        supabase
          .from("chat_members")
          .select("unread_count")
          .eq("user_id", userId)
          .gt("unread_count", 0)
          .then(({ data }) => {
            const total = (data || []).reduce((sum: number, r: any) => sum + (r.unread_count || 0), 0);
            setChatCount(total);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notifSub);
      supabase.removeChannel(chatSub);
    };
  }, [userId]);

  return { notifCount, chatCount };
}

// ─── Badge pill ───────────────────────────────────────────────────────────────

function CountBadge({ count, color = "#FF3B30" }: { count: number; color?: string }) {
  if (count <= 0) return null;
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: color }]}>
      <Text style={badgeStyles.text}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  text: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type DropdownItem = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  section?: DesktopSection;
  route?: string;
  color?: string;
  badge?: string;
  dividerAbove?: boolean;
};

type NavDef = {
  key: DesktopSection | "create" | "match";
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  dropdown?: DropdownItem[];
  requiresAuth?: boolean;
};

// ─── Dropdown item data ───────────────────────────────────────────────────────

const CONNECT_ITEMS: DropdownItem[] = [
  { key: "messages",   label: "Messages",       icon: "chatbubble-ellipses",   section: "chats" },
  { key: "contacts",   label: "Contacts",        icon: "people",                section: "contacts" },
  { key: "grp-create", label: "Create Group",   icon: "people-circle-outline", route: "/group/create" },
  { key: "chn-create", label: "Create Channel", icon: "megaphone-outline",     route: "/channel/create" },
];

const CREATE_ITEMS: DropdownItem[] = [
  { key: "post",    label: "New Post",      icon: "create-outline",    route: "/moments/create" },
  { key: "article", label: "Write Article", icon: "newspaper-outline", route: "/moments/create-article" },
  { key: "video",   label: "Upload Video",  icon: "videocam-outline",  route: "/moments/create-video" },
  { key: "story",   label: "New Story",     icon: "add-circle-outline",route: "/stories/create" },
];

const WALLET_ITEMS: DropdownItem[] = [
  { key: "wallet",    label: "My Wallet",  icon: "wallet",             section: "wallet" },
  { key: "topup",     label: "Top Up",     icon: "add-circle",         route: "/wallet/topup" },
  { key: "transfer",  label: "Transfer",   icon: "swap-horizontal",    route: "/mini-programs/transfer" },
  { key: "requests",  label: "Requests",   icon: "receipt-outline",    route: "/wallet/requests" },
  { key: "giftvault", label: "Gift Vault", icon: "gift",               route: "/wallet/gift-vault" },
];

const APPS_ITEMS_COL1: DropdownItem[] = [
  { key: "ai",       label: "AfuAI",         icon: "sparkles",        section: "ai",            badge: "AI",  color: BRAND },
  { key: "games",    label: "Games",          icon: "game-controller", route: "/games",                        color: "#007AFF" },
  { key: "gifts",    label: "Gifts",          icon: "gift",            route: "/gifts",                        color: "#AF52DE" },
  { key: "match",    label: "AfuMatch",       icon: "heart",           section: "match",                       color: "#FF2D55" },
  { key: "events",   label: "Events",         icon: "calendar",        route: "/digital-events",               color: "#FF9500" },
];

const APPS_ITEMS_COL2: DropdownItem[] = [
  { key: "store",     label: "Marketplace",   icon: "storefront",      route: "/store",                        color: "#FF2D55" },
  { key: "freelance", label: "Freelance",     icon: "briefcase",       route: "/freelance",                    color: "#34C759" },
  { key: "files",     label: "File Manager",  icon: "folder",          route: "/file-manager",                 color: "#5856D6" },
  { key: "saved",     label: "Saved Posts",   icon: "bookmark",        route: "/saved-posts",                  color: "#FF6B35" },
  { key: "referral",  label: "Referral",      icon: "people",          route: "/referral",                     color: "#00C781" },
];

const NAV_DEFS: NavDef[] = [
  { key: "discover", label: "Home",        icon: "home-outline" },
  { key: "search",   label: "Explore",     icon: "search-outline" },
  { key: "chats",    label: "Connect",     dropdown: CONNECT_ITEMS,   requiresAuth: true },
  { key: "create",   label: "Create",      dropdown: CREATE_ITEMS,    requiresAuth: true },
  { key: "wallet",   label: "Wallet",      dropdown: WALLET_ITEMS,    requiresAuth: true },
  { key: "apps",     label: "Apps",        icon: "grid-outline" },
];

// ─── Dropdown row ─────────────────────────────────────────────────────────────

function DropdownRow({
  item,
  onPress,
  colors,
}: {
  item: DropdownItem;
  onPress: () => void;
  colors: any;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.menuRow, hovered && { backgroundColor: colors.accent + "10" }]}
      {...(hoverProps as any)}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: (item.color ?? BRAND) + "18" }]}>
        <Ionicons name={item.icon} size={14} color={item.color ?? BRAND} />
      </View>
      <Text style={[styles.menuRowLabel, { color: colors.text }]}>{item.label}</Text>
      {!!item.badge && (
        <View style={[styles.menuBadge, { backgroundColor: (item.color ?? BRAND) + "20" }]}>
          <Text style={[styles.menuBadgeText, { color: item.color ?? BRAND }]}>{item.badge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Dropdown panel (single or dual column) ──────────────────────────────────

function DropdownPanel({
  col1,
  col2,
  onClose,
  onSection,
  colors,
}: {
  col1: DropdownItem[];
  col2?: DropdownItem[];
  onClose: () => void;
  onSection: (s: DesktopSection) => void;
  colors: any;
}) {
  function handle(item: DropdownItem) {
    onClose();
    if (item.section) { onSection(item.section); return; }
    if (item.route) router.push(item.route as any);
  }

  return (
    <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* col1 */}
      <View style={col2 ? { flex: 1 } : undefined}>
        {col1.map((item) => (
          <React.Fragment key={item.key}>
            {item.dividerAbove && <View style={[styles.ddivider, { backgroundColor: colors.border }]} />}
            <DropdownRow item={item} onPress={() => handle(item)} colors={colors} />
          </React.Fragment>
        ))}
      </View>
      {/* col2 */}
      {col2 && (
        <>
          <View style={[styles.ddividerV, { backgroundColor: colors.border }]} />
          <View style={{ flex: 1 }}>
            {col2.map((item) => (
              <React.Fragment key={item.key}>
                {item.dividerAbove && <View style={[styles.ddivider, { backgroundColor: colors.border }]} />}
                <DropdownRow item={item} onPress={() => handle(item)} colors={colors} />
              </React.Fragment>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Single nav tab ───────────────────────────────────────────────────────────

function NavTab({
  def,
  isActive,
  onPress,
  onSection,
  colors,
}: {
  def: NavDef;
  isActive: boolean;
  onPress: () => void;
  onSection: (s: DesktopSection) => void;
  colors: any;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hasDropdown = !!def.dropdown;
  const isApps = def.key === "apps";

  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  function handlePress() {
    if (hasDropdown) setOpen((v) => !v);
    else if (isApps) onSection("apps");
    else onPress();
  }

  const activeColor = BRAND;
  const idleColor = colors.textMuted;
  const textColor = isActive ? activeColor : idleColor;

  return (
    <View style={{ position: "relative" }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[
          styles.navTab,
          hovered && !isActive && { backgroundColor: colors.textMuted + "0d" },
        ]}
        {...(hoverProps as any)}
      >
        {def.icon && <Ionicons name={def.icon as any} size={16} color={textColor} />}
        <Text
          style={[
            styles.navTabLabel,
            {
              color: textColor,
              fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium",
            },
          ]}
        >
          {def.label}
        </Text>
        {hasDropdown && (
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={11} color={textColor} />
        )}
        {isActive && <View style={[styles.activeIndicator, { backgroundColor: activeColor }]} />}
      </TouchableOpacity>

      {hasDropdown && open && (
        <>
          <Pressable style={StyleSheet.absoluteFillObject as any} onPress={() => setOpen(false)} />
          <DropdownPanel
            col1={def.key === "apps" ? APPS_ITEMS_COL1 : def.dropdown!}
            col2={def.key === "apps" ? APPS_ITEMS_COL2 : undefined}
            onClose={() => setOpen(false)}
            onSection={(s) => { setOpen(false); onSection(s); }}
            colors={colors}
          />
        </>
      )}
    </View>
  );
}

// ─── User menu ────────────────────────────────────────────────────────────────

function buildUserMenu(isAdmin: boolean): DropdownItem[] {
  const base: DropdownItem[] = [
    { key: "profile",      label: "View Profile",     icon: "person-circle-outline",    section: "profile" },
    { key: "edit",         label: "Edit Profile",      icon: "create-outline",           route: "/profile/edit" },
    { key: "digitalid",   label: "Digital ID",        icon: "id-card-outline",           route: "/digital-id" },
    { key: "achievements", label: "Achievements",     icon: "trophy-outline",            route: "/achievements" },
    { key: "prestige",     label: "Prestige",         icon: "ribbon-outline",            route: "/prestige" },
    { key: "premium",      label: "Go Premium",       icon: "star-outline",              route: "/premium",          color: "#D4A853" },
    { key: "usernames",    label: "Username Market",  icon: "at-outline",               route: "/username-market" },
    { key: "settings",     label: "Settings",         icon: "settings-outline",          section: "settings",       dividerAbove: true },
  ];
  if (isAdmin) {
    base.push({ key: "admin", label: "Admin Panel", icon: "shield-checkmark-outline", route: "/admin", color: "#FF3B30" });
  }
  return base;
}

function UserMenuPanel({
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
  const menuItems = buildUserMenu(isAdmin);

  const themeLabel =
    themeMode === "dark" ? "Light mode" : themeMode === "light" ? "System theme" : "Dark mode";
  const themeIcon: React.ComponentProps<typeof Ionicons>["name"] =
    themeMode === "dark" ? "sunny-outline" : themeMode === "light" ? "contrast-outline" : "moon-outline";

  function handle(item: DropdownItem) {
    onClose();
    if (item.section) { onSection(item.section); return; }
    if (item.route) router.push(item.route as any);
  }

  return (
    <View style={[styles.userMenuPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={[styles.userMenuHeader, { borderBottomColor: colors.border }]}>
        <Avatar uri={profile?.avatar_url ?? null} name={profile?.display_name || "?"} size={36} style={{ borderRadius: 8 }} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.umName, { color: colors.text }]} numberOfLines={1}>
            {profile?.display_name || "User"}
          </Text>
          <Text style={[styles.umHandle, { color: colors.textMuted }]} numberOfLines={1}>
            @{profile?.handle || "user"}
          </Text>
        </View>
      </View>

      {/* Menu items */}
      {menuItems.map((item) => (
        <React.Fragment key={item.key}>
          {item.dividerAbove && <View style={[styles.ddivider, { backgroundColor: colors.border }]} />}
          <DropdownRow item={item} onPress={() => handle(item)} colors={colors} />
        </React.Fragment>
      ))}

      <View style={[styles.ddivider, { backgroundColor: colors.border }]} />

      {/* Theme */}
      <TouchableOpacity onPress={() => { onClose(); cycleTheme(); }} activeOpacity={0.8} style={styles.menuRow}>
        <View style={[styles.menuIconWrap, { backgroundColor: colors.textMuted + "18" }]}>
          <Ionicons name={themeIcon} size={14} color={colors.textMuted} />
        </View>
        <Text style={[styles.menuRowLabel, { color: colors.text }]}>{themeLabel}</Text>
      </TouchableOpacity>

      {/* Sign out */}
      <TouchableOpacity onPress={onSignOut} activeOpacity={0.8} style={styles.menuRow}>
        <View style={[styles.menuIconWrap, { backgroundColor: "#FF3B30" + "18" }]}>
          <Ionicons name="log-out-outline" size={14} color="#FF3B30" />
        </View>
        <Text style={[styles.menuRowLabel, { color: "#FF3B30" }]}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

type Props = {
  activeSection: DesktopSection;
  onSectionChange: (s: DesktopSection) => void;
  hasSession: boolean;
};

export function DesktopTopNav({ activeSection, onSectionChange, hasSession }: Props) {
  const { user, profile, signOut } = useAuth();
  const { colors, isDark, themeMode, setThemeMode } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { notifCount, chatCount } = useUnreadCounts(hasSession ? (user?.id ?? null) : null);

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
        onPress: async () => { await signOut(); router.replace("/(auth)/login"); },
      },
    ]);
  }

  function isSectionActive(def: NavDef): boolean {
    if (def.key === "create") return false;
    if (def.dropdown) {
      return def.dropdown.some((d) => d.section === activeSection);
    }
    return def.key === activeSection;
  }

  return (
    <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {/* Left: logo + nav */}
      <View style={styles.leftRow}>
        <TouchableOpacity onPress={() => onSectionChange("discover")} activeOpacity={0.85} style={styles.logoBtn}>
          <View style={[styles.logoCircle, { backgroundColor: BRAND }]}>
            <Image source={afuSymbol} style={styles.logoImg} resizeMode="contain" />
          </View>
          <Text style={[styles.logoLabel, { color: colors.text }]}>AfuChat</Text>
        </TouchableOpacity>

        <View style={[styles.navSep, { backgroundColor: colors.border }]} />

        {NAV_DEFS.map((def) => {
          if (def.requiresAuth && !hasSession) return null;
          return (
            <NavTab
              key={def.key}
              def={def}
              isActive={isSectionActive(def)}
              onPress={() => {
                if (def.key !== "create" && !def.dropdown) {
                  onSectionChange(def.key as DesktopSection);
                }
              }}
              onSection={onSectionChange}
              colors={colors}
            />
          );
        })}
      </View>

      {/* Right: actions */}
      <View style={styles.rightRow}>
        {hasSession && (
          <>
            {/* Notifications */}
            <TouchableOpacity
              onPress={() => onSectionChange("notifications")}
              activeOpacity={0.8}
              style={[styles.iconBtn, activeSection === "notifications" && { backgroundColor: BRAND + "18" }]}
            >
              <Ionicons
                name={activeSection === "notifications" ? "notifications" : "notifications-outline"}
                size={19}
                color={activeSection === "notifications" ? BRAND : colors.textMuted}
              />
              <CountBadge count={notifCount} />
            </TouchableOpacity>

            {/* Messages shortcut */}
            <TouchableOpacity
              onPress={() => onSectionChange("chats")}
              activeOpacity={0.8}
              style={[styles.iconBtn, activeSection === "chats" && { backgroundColor: BRAND + "18" }]}
            >
              <Ionicons
                name={activeSection === "chats" ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
                size={19}
                color={activeSection === "chats" ? BRAND : colors.textMuted}
              />
              <CountBadge count={chatCount} />
            </TouchableOpacity>

            {/* Match shortcut */}
            <TouchableOpacity
              onPress={() => onSectionChange("match")}
              activeOpacity={0.8}
              style={[styles.iconBtn, activeSection === "match" && { backgroundColor: "#FF2D55" + "18" }]}
            >
              <Ionicons
                name={activeSection === "match" ? "heart" : "heart-outline"}
                size={19}
                color={activeSection === "match" ? "#FF2D55" : colors.textMuted}
              />
            </TouchableOpacity>

            {/* Post button */}
            <TouchableOpacity
              onPress={() => router.push("/moments/create" as any)}
              activeOpacity={0.85}
              style={[styles.postBtn, { backgroundColor: BRAND }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.postBtnLabel}>Post</Text>
            </TouchableOpacity>

            {/* Avatar + menu */}
            <View style={{ position: "relative" as any }}>
              <TouchableOpacity
                onPress={() => setUserMenuOpen((v) => !v)}
                activeOpacity={0.8}
                style={styles.avatarBtn}
              >
                <Avatar uri={profile?.avatar_url ?? null} name={profile?.display_name || "?"} size={30} style={{ borderRadius: 6 }} />
                <Ionicons name={userMenuOpen ? "chevron-up" : "chevron-down"} size={11} color={colors.textMuted} style={{ marginLeft: 2 }} />
              </TouchableOpacity>

              {userMenuOpen && (
                <>
                  <Pressable
                    style={[StyleSheet.absoluteFillObject as any, { position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }]}
                    onPress={() => setUserMenuOpen(false)}
                  />
                  <UserMenuPanel
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
          </>
        )}

        {!hasSession && (
          <View style={styles.authBtns}>
            <TouchableOpacity onPress={() => router.push("/(auth)/login" as any)} activeOpacity={0.8} style={[styles.loginBtn, { borderColor: colors.border }]}>
              <Text style={[styles.loginBtnLabel, { color: colors.text }]}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(auth)/register" as any)} activeOpacity={0.85} style={[styles.signupBtn, { backgroundColor: BRAND }]}>
              <Text style={styles.signupBtnLabel}>Sign up free</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

/** Backwards-compat alias */
export const DesktopIconRail = DesktopTopNav;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create<any>({
  topbar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    zIndex: 100,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 2,
    overflow: "hidden",
  },

  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },

  // Logo
  logoBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginRight: 4 },
  logoCircle: { width: 30, height: 30, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  logoImg: { width: 17, height: 17, tintColor: "#fff" },
  logoLabel: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },

  navSep: { width: 1, height: 20, marginHorizontal: 8, opacity: 0.35 },

  // Nav tab
  navTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 8,
    position: "relative",
  },
  navTabLabel: { fontSize: 13.5 },
  activeIndicator: {
    position: "absolute",
    bottom: -8,
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 1,
  },

  // Dropdown
  dropdown: {
    position: "absolute",
    top: 44,
    left: 0,
    flexDirection: "row",
    minWidth: 200,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  menuRowLabel: {
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  menuBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  menuBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  ddivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 12,
  },
  ddividerV: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 6,
  },

  // User menu
  userMenuPanel: {
    position: "absolute",
    top: 44,
    right: 0,
    width: 248,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  userMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  umName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  umHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Right side actions
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  postBtnLabel: { color: "#fff", fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  avatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
  },

  // Auth
  authBtns: { flexDirection: "row", alignItems: "center", gap: 8 },
  loginBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  loginBtnLabel: { fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
  signupBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  signupBtnLabel: { color: "#fff", fontSize: 13.5, fontFamily: "Inter_600SemiBold" },
});
