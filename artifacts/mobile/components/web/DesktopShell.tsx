import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import { safeRouter } from "@/lib/navUtils";
import { Avatar } from "@/components/ui/Avatar";
import { ChatsListPanel } from "@/app/(tabs)/index";

const DESKTOP_BREAKPOINT = 980;

const NAV_ITEMS = [
  { route: "/(tabs)/chats", label: "Chat", icon: "chatbubbles-outline" },
  { route: "/(tabs)/discover", label: "Discover", icon: "compass-outline" },
  { route: "/(tabs)/shorts", label: "Shorts", icon: "play-circle-outline" },
  { route: "/(tabs)/communities", label: "Communities", icon: "people-outline" },
  { route: "/ai", label: "AI Assistant", icon: "bulb-outline" },
  { route: "/(tabs)/apps", label: "Apps", icon: "grid-outline" },
  { route: "/(tabs)/me", label: "Me", icon: "person-circle-outline" },
] as const;

function normalizePath(pathname: string): string {
  if (pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index") {
    return "/(tabs)/chats";
  }
  if (pathname === "/chats" || pathname.startsWith("/chat/")) return "/(tabs)/chats";
  if (pathname === "/discover") return "/(tabs)/discover";
  if (pathname === "/shorts") return "/(tabs)/shorts";
  if (pathname === "/communities") return "/(tabs)/communities";
  if (pathname === "/apps") return "/(tabs)/apps";
  if (pathname === "/me") return "/(tabs)/me";
  return pathname;
}

function routeTitle(pathname: string): string {
  if (pathname.startsWith("/chat/")) return "Chat";
  const active = NAV_ITEMS.find((item) => normalizePath(pathname) === item.route);
  return active?.label ?? "AfuChat";
}

function isPublicRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/(auth)") ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/welcome" ||
    pathname === "/onboarding" ||
    pathname === "/privacy" ||
    pathname === "/terms"
  );
}

export default function DesktopShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname() || "/";
  const { colors, isDark } = useTheme();
  const { user, session, profile } = useAuth();
  const { t } = useLanguage();
  const [isNavExpanded, setIsNavExpanded] = useState(true);

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isSignedIn = !!session?.user || !!user;
  const shouldShow = isDesktop && isSignedIn && !isPublicRoute(pathname);
  const normalizedPath = normalizePath(pathname);
  const title = routeTitle(pathname);
  const isChatDetail = pathname.startsWith("/chat/");

  const activeRoute = useMemo(
    () => NAV_ITEMS.find((item) => item.route === normalizedPath)?.route,
    [normalizedPath],
  );

  if (!shouldShow) return <>{children}</>;

  return (
    <View style={[styles.shell, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.sidebar,
          isNavExpanded ? styles.sidebarExpanded : styles.sidebarCollapsed,
          {
            backgroundColor: isDark ? colors.surface : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={[styles.brandRow, !isNavExpanded && styles.brandRowCollapsed]}>
          <View style={styles.brandIdentity}>
            <View style={[styles.brandMark, { backgroundColor: colors.accent }]}>
              <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
            </View>
            {isNavExpanded && (
              <Text style={[styles.brandName, { color: colors.text }]}>
                Afu<Text style={{ color: colors.accent }}>Chat</Text>
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => setIsNavExpanded((expanded) => !expanded)}
            accessibilityRole="button"
            accessibilityLabel={isNavExpanded ? t("Collapse navigation") : t("Expand navigation")}
            accessibilityState={{ expanded: isNavExpanded }}
            style={({ hovered, pressed }) => [
              styles.collapseButton,
              { backgroundColor: colors.backgroundSecondary },
              hovered && { backgroundColor: colors.accent + "18" },
              pressed && { opacity: 0.72 },
            ]}
          >
            <Ionicons
              name={isNavExpanded ? "chevron-back-outline" : "chevron-forward-outline"}
              size={17}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>

        <ScrollView
          style={styles.navScroll}
          contentContainerStyle={styles.navContent}
          showsVerticalScrollIndicator={false}
        >
          {isNavExpanded && (
            <Text style={[styles.navEyebrow, { color: colors.textMuted }]}>WORKSPACE</Text>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = activeRoute === item.route;
            return (
              <Pressable
                key={item.route}
                onPress={() => safeRouter.navigate(item.route as any)}
                accessibilityRole="button"
                accessibilityLabel={t(item.label)}
                accessibilityState={{ selected: isActive }}
                style={({ hovered, pressed }) => [
                  styles.navItem,
                  !isNavExpanded && styles.navItemCollapsed,
                  isActive && { backgroundColor: colors.accent + "18" },
                  hovered && !isActive && { backgroundColor: colors.backgroundSecondary },
                  pressed && { opacity: 0.72 },
                ]}
              >
                <View
                  style={[
                    styles.navIconWrap,
                    isActive && { backgroundColor: colors.accent },
                  ]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={19}
                    color={isActive ? "#fff" : colors.textSecondary}
                  />
                </View>
                {isNavExpanded && (
                  <Text
                    style={[
                      styles.navLabel,
                      { color: isActive ? colors.accent : colors.textSecondary },
                      isActive && styles.navLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {t(item.label)}
                  </Text>
                )}
                {isNavExpanded && item.route === "/(tabs)/chats" && (
                  <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.sidebarFooter, !isNavExpanded && styles.sidebarFooterCollapsed, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => safeRouter.navigate("/(tabs)/me" as any)}
            accessibilityRole="button"
            accessibilityLabel={t("Open profile")}
            style={({ hovered, pressed }) => [
              styles.profileRow,
              hovered && { backgroundColor: colors.backgroundSecondary },
              pressed && { opacity: 0.72 },
            ]}
          >
            <Avatar
              uri={profile?.avatar_url}
              name={profile?.display_name || "Me"}
              size={36}
              userId={user?.id}
            />
            {isNavExpanded && (
              <>
                <View style={styles.profileCopy}>
                  <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>
                    {profile?.display_name || "Your profile"}
                  </Text>
                  <Text style={[styles.profileStatus, { color: colors.textMuted }]} numberOfLines={1}>
                    @{profile?.handle || "you"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </>
            )}
          </Pressable>
          {isNavExpanded && (
            <View style={styles.connectionRow}>
              <View style={[styles.connectionDot, { backgroundColor: "#27B77A" }]} />
              <Text style={[styles.connectionText, { color: colors.textMuted }]}>
                Connected across your devices
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.workspace}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.topBarTitle, { color: colors.text }]}>{t(title)}</Text>
            <Text style={[styles.topBarSubtitle, { color: colors.textMuted }]}>
              Connect, share, be you.
            </Text>
          </View>
          <View style={styles.topBarActions}>
            <Pressable
              onPress={() => safeRouter.push("/search" as any)}
              accessibilityRole="button"
              accessibilityLabel={t("Search")}
              style={({ hovered, pressed }) => [
                styles.topBarButton,
                { backgroundColor: colors.backgroundSecondary },
                hovered && { backgroundColor: colors.accent + "18" },
                pressed && { opacity: 0.72 },
              ]}
            >
              <Ionicons name="search-outline" size={19} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => safeRouter.push("/settings" as any)}
              accessibilityRole="button"
              accessibilityLabel={t("Settings")}
              style={({ hovered, pressed }) => [
                styles.topBarButton,
                { backgroundColor: colors.backgroundSecondary },
                hovered && { backgroundColor: colors.accent + "18" },
                pressed && { opacity: 0.72 },
              ]}
            >
              <Ionicons name="settings-outline" size={19} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.contentArea}>
          {isChatDetail ? (
            <View style={styles.masterDetail}>
              <View
                style={[
                  styles.chatRail,
                  { backgroundColor: colors.background, borderRightColor: colors.border },
                ]}
              >
                <ChatsListPanel />
              </View>
              <View style={styles.detailPane}>{children}</View>
            </View>
          ) : (
            <View style={styles.detailPane}>{children}</View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, minHeight: 0, flexDirection: "row", minWidth: 980 },
  sidebar: {
    flexShrink: 0,
    marginVertical: 14,
    marginLeft: 12,
    borderWidth: 1,
    borderRadius: 17,
    paddingTop: 10,
    overflow: "hidden",
    ...({ transition: "width 180ms ease, background-color 180ms ease" } as any),
    ...({ boxShadow: "0 8px 24px rgba(56,45,29,0.12)" } as any),
  },
  sidebarExpanded: { width: 176 },
  sidebarCollapsed: { width: 64 },
  brandRow: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 9,
    gap: 5,
  },
  brandRowCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  brandIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
    flex: 1,
  },
  brandMark: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { fontSize: 16, lineHeight: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.35 },
  collapseButton: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer" as any,
    flexShrink: 0,
  },
  navScroll: { flex: 1, minHeight: 0, marginTop: 17 },
  navContent: { paddingHorizontal: 10, paddingBottom: 12 },
  navEyebrow: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.05,
    marginHorizontal: 10,
    marginBottom: 7,
  },
  navItem: {
    minHeight: 38,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    marginBottom: 2,
    gap: 9,
    cursor: "pointer" as any,
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  navIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontFamily: "Inter_500Medium" },
  navLabelActive: { fontFamily: "Inter_700Bold" },
  liveDot: { width: 5, height: 5, borderRadius: 3, marginRight: 2 },
  sidebarFooter: { borderTopWidth: 0.5, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  sidebarFooterCollapsed: { paddingHorizontal: 7, alignItems: "center" },
  profileRow: {
    borderRadius: 9,
    padding: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    cursor: "pointer" as any,
  },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_600SemiBold" },
  profileStatus: { fontSize: 10, lineHeight: 13, marginTop: 1 },
  connectionRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 5, paddingTop: 7 },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 9, lineHeight: 12, flex: 1, minWidth: 0 },
  workspace: { flex: 1, minWidth: 0, minHeight: 0 },
  topBar: {
    minHeight: 62,
    paddingHorizontal: 22,
    paddingTop: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
  },
  topBarTitle: { fontSize: 17, lineHeight: 22, fontFamily: "Inter_700Bold" },
  topBarSubtitle: { fontSize: 10, lineHeight: 14, marginTop: 8 },
  topBarActions: { flexDirection: "row", gap: 6, paddingTop: 15 },
  topBarButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer" as any,
  },
  contentArea: { flex: 1, minHeight: 0 },
  masterDetail: { flex: 1, flexDirection: "row", minWidth: 0 },
  chatRail: {
    width: 360,
    flexShrink: 0,
    borderRightWidth: 0.5,
    overflow: "hidden",
  },
  detailPane: { flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" },
});