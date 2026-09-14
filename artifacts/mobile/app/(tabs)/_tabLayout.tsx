import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { Security2FABanner } from "@/components/ui/Security2FABanner";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { usePathname } from "expo-router";
import { safeRouter } from "@/lib/navUtils";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { TabSwipeProvider } from "@/context/TabSwipeContext";
import { getLocalConversations } from "@/lib/storage/localConversations";
import { supabase } from "@/lib/supabase";
import { getTotalUnread, subscribeUnread } from "@/lib/chatUnreadEvents";
import { Avatar } from "@/components/ui/Avatar";
import { useLanguage } from "@/context/LanguageContext";

// Visible bottom bar tabs — Chat · Discover · Shorts · Apps · Me
const BOTTOM_TABS = [
  { route: "/(tabs)/chats",    icon: "chatbubbles",        label: "navigation.chat"     },
  { route: "/(tabs)/discover", icon: "compass",            label: "navigation.discover" },
  { route: "/(tabs)/shorts",   icon: "play-circle",        label: "navigation.shorts"   },
  { route: "/(tabs)/apps",     icon: "grid",               label: "navigation.apps"     },
  { route: "/(tabs)/me",       icon: "person-circle",      label: "navigation.me"       },
] as const;

function normalizeTabPath(p: string): string {
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/index") return "/(tabs)/chats";
  if (p === "/chats"    || p === "/(tabs)/chats")    return "/(tabs)/chats";
  if (p === "/discover" || p === "/(tabs)/discover") return "/(tabs)/discover";
  if (p === "/shorts"   || p === "/(tabs)/shorts")   return "/(tabs)/shorts";
  if (p === "/apps"     || p === "/(tabs)/apps")     return "/(tabs)/apps";
  if (p === "/me"       || p === "/(tabs)/me")       return "/(tabs)/me";
  if (p === "/search"   || p === "/(tabs)/search")   return "/(tabs)/search";
  return p;
}

function useTotalUnread(userId: string | undefined): number {
  const [total, setTotal] = useState(() => getTotalUnread());

  useEffect(() => {
    if (!userId) return;

    const unsubStore = subscribeUnread(setTotal);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const fallbackRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        try {
          const convs = await getLocalConversations();
          if (!cancelled) {
            setTotal(convs.reduce((s, c) => s + (c.unread_count ?? 0), 0));
          }
        } catch {}
      }, 250);
    };
    const chName = `tab-bar-unread-${userId}`;
    const channelTopic = `realtime:${chName}`;
    let ch: RealtimeChannel | null = null;

    // Web Strict Mode and fast auth transitions can run this effect again
    // before the previous channel has finished unsubscribing. Realtime rejects
    // callbacks added to a channel after subscribe(), so remove every stale
    // same-topic channel before constructing and configuring the replacement.
    const setupChannel = async () => {
      const staleChannels = supabase
        .getChannels()
        .filter((existing) => existing.topic === channelTopic);
      await Promise.all(
        staleChannels.map((staleChannel) =>
          supabase.removeChannel(staleChannel).catch(() => "error"),
        ),
      );
      if (cancelled) return;

      ch = supabase
        .channel(chName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "message_status",
            filter: `user_id=eq.${userId}`,
          },
          fallbackRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "message_status",
            filter: `user_id=eq.${userId}`,
          },
          fallbackRefresh,
        );

      if (cancelled) {
        await supabase.removeChannel(ch).catch(() => {});
        ch = null;
        return;
      }

      ch.subscribe((status) => {
        if (
          status === "CHANNEL_ERROR" &&
          !cancelled &&
          (__DEV__ || process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS === "1")
        ) {
          console.warn("[tab-bar-unread] Realtime channel error", {
            channel: chName,
            userId,
          });
        }
      });
    };
    void setupChannel();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubStore();
      if (ch) {
        void supabase.removeChannel(ch).catch(() => {});
        ch = null;
      }
    };
  }, [userId]);

  return total;
}

// ── Floating pill tab bar ─────────────────────────────────────────────────────
export function CompactTabBar({
  userId,
  avatarUrl,
  displayName,
}: {
  userId: string | undefined;
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
}) {
  const pathname           = usePathname();
  const insets             = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const totalUnread        = useTotalUnread(userId);
  const active             = normalizeTabPath(pathname);
  const [showCreateActions, setShowCreateActions] = useState(false);
  // Keep this binding distinct from older module-level brand constants. A
  // previous name collided in the transformed web bundle and caused a TDZ
  // crash while TabLayout was mounting.
  const accentColor = colors.accent;

  const CREATE_OPTIONS = [
    { icon: "camera",        label: "navigation.story",   route: "/stories/camera",        color: accentColor },
    { icon: "create",        label: "navigation.post",    route: "/moments/create",        color: accentColor },
    { icon: "videocam",      label: "navigation.video",   route: "/moments/create-video",  color: accentColor },
    { icon: "document-text", label: "navigation.article", route: "/moments/create-article", color: accentColor },
  ];

  const INACTIVE_ICON  = colors.textSecondary;
  const ACTIVE_ICON    = colors.accent;
  const PILL_BOTTOM    = Math.max(insets.bottom, 8) + 6;
  const PILL_H         = 56;
  const BAR_BORDER     = colors.border;
  const ACTIVE_WRAP    = colors.accent;

  function handleTabPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    safeRouter.navigate(route as any);
  }

  function handleCreateAction(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowCreateActions(false);
    safeRouter.push(route as any);
  }

  return (
    <>
      {/* ── Pill bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          pill.rowWrap,
          { bottom: PILL_BOTTOM, pointerEvents: "box-none" },
        ]}
      >
        <View
          style={[
            pill.bar,
            {
              height: PILL_H,
              backgroundColor: colors.surface,
              borderColor: BAR_BORDER,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.35 : 0.12,
                  shadowRadius: 16,
                },
                android: { elevation: 8 },
                web: { boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.10)" } as any,
              }),
            },
          ]}
        >
          {BOTTOM_TABS.map((tab) => {
            const focused   = active === tab.route;
            const iconColor = focused ? colors.bubbleText : INACTIVE_ICON;

            return (
              <TouchableOpacity
                key={tab.route}
                style={pill.tab}
                onPress={() => handleTabPress(tab.route)}
                activeOpacity={0.7}
                accessibilityRole="button"
                 accessibilityLabel={t(tab.label)}
                accessibilityState={{ selected: focused }}
              >
                <View
                  style={pill.iconWrap}
                >
                  {focused && (
                    <View
                      style={[
                        pill.activeIconOval,
                        { backgroundColor: ACTIVE_WRAP, pointerEvents: "none" },
                      ]}
                    />
                  )}
                  {tab.route === "/(tabs)/me" ? (
                    <Avatar
                      uri={avatarUrl}
                       name={displayName || t("navigation.me")}
                      size={24}
                      userId={userId}
                    />
                  ) : (
                    <Ionicons name={tab.icon as any} size={22} color={iconColor} />
                  )}
                  {/* Unread badge on Chat */}
                  {tab.route === "/(tabs)/chats" && totalUnread > 0 && (
                    <View style={[pill.badge, { backgroundColor: accentColor }]}>
                      <Text style={pill.badgeText} numberOfLines={1}>
                        {totalUnread > 99 ? "99+" : String(totalUnread)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    pill.label,
                    { color: focused ? ACTIVE_ICON : INACTIVE_ICON },
                  ]}
                  numberOfLines={1}
                  allowFontScaling={false}
                  maxFontSizeMultiplier={1}
                >
                   {t(tab.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Create FAB and its expanded action FABs */}
      {active === "/(tabs)/discover" && (
        <>
          {showCreateActions && CREATE_OPTIONS.map((opt, index) => (
            <TouchableOpacity
              key={opt.route}
              onPress={() => handleCreateAction(opt.route)}
              style={[
                pill.actionFab,
                {
                  bottom: PILL_BOTTOM + PILL_H + 72 + (CREATE_OPTIONS.length - index - 1) * 58,
                  right: 28,
                  backgroundColor: isDark ? colors.surface : colors.card,
                  borderColor: accentColor,
                },
              ]}
              activeOpacity={0.8}
              accessibilityRole="button"
               accessibilityLabel={`${t("navigation.create")} ${t(opt.label)}`}
            >
              <View style={pill.actionLabel}>
                <Text
                  style={[
                    pill.actionLabelText,
                    { color: accentColor, textAlign: "left" },
                  ]}
                >
                  {t(opt.label)}
                </Text>
              </View>
              <View style={[pill.actionIcon, { backgroundColor: accentColor }]}>
                <Ionicons name={opt.icon as any} size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              setShowCreateActions((open) => !open);
            }}
            style={[
              pill.fab,
              {
                bottom: PILL_BOTTOM + PILL_H + 12,
                right: 24,
                backgroundColor: accentColor,
              },
            ]}
            activeOpacity={0.82}
            accessibilityRole="button"
             accessibilityLabel={showCreateActions ? t("navigation.close_create_options") : t("navigation.create")}
            accessibilityState={{ expanded: showCreateActions }}
          >
            <Ionicons name={showCreateActions ? "close" : "add"} size={28} color="#fff" />
          </TouchableOpacity>
        </>
      )}

      {/* FAB — Compose, right side, chats tab only */}
      {active === "/(tabs)/chats" && !!userId && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            safeRouter.push("/chat/new" as any);
          }}
          style={[
            pill.fab,
            {
              bottom: PILL_BOTTOM + PILL_H + 12,
              right: 24,
              backgroundColor: accentColor,
            },
          ]}
          activeOpacity={0.82}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

    </>
  );
}

const pill = StyleSheet.create({
  rowWrap: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    width: "100%",
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 0,
  },
  iconWrap: {
    width: 44,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeIconOval: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
  },
  label: {
    width: "100%",
    fontSize: 9,
    lineHeight: 10,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: 0.2,
    marginTop: 0,
    textAlign: "center",
    includeFontPadding: false,
    textTransform: "uppercase",
  },
  fab: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  actionFab: {
    position: "absolute",
    width: 142,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    flexDirection: "row",
    paddingLeft: 14,
    paddingRight: 4,
    justifyContent: "space-between",
    overflow: "hidden",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.18)" } as any,
    }),
  },
  actionLabel: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  actionLabelText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    zIndex: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    lineHeight: 12,
  },
});

function ClassicTabLayout({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneStyle: { backgroundColor: "transparent" },
        tabBarStyle: {
          display: "none",
          backgroundColor: "transparent",
          elevation: 0,
          ...Platform.select({ web: {}, default: { shadowOpacity: 0 } }),
          borderTopWidth: 0,
        },
        tabBarBackground: () => null,
      }}
    >
      <Tabs.Screen name="index"         options={{ href: null }} />
      <Tabs.Screen name="chats"         options={{ href: isLoggedIn ? undefined : null }} />
      <Tabs.Screen name="discover"      options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
      <Tabs.Screen name="shorts"        options={{ href: isLoggedIn ? undefined : null, lazy: true, sceneStyle: { backgroundColor: "#000" } }} />
      <Tabs.Screen name="search"        options={{ href: null }} />
      <Tabs.Screen name="contacts"      options={{ href: null }} />
      <Tabs.Screen name="communities"   options={{ href: null }} />
      <Tabs.Screen name="apps"          options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
      <Tabs.Screen name="me"            options={{ href: isLoggedIn ? undefined : null, lazy: true }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { session, profile, loading, user } = useAuth();
  const isLoggedIn     = !!session || !!user;
  const prevSessionRef = useRef<Session | null>(null);
  const insets         = useSafeAreaInsets();
  const { width }      = useWindowDimensions();
  const isDesktop      = Platform.OS === "web" && width >= 980;

  useEffect(() => {
    if (loading) return;
    const isFullySignedOut = session === null && user === null;
    if (prevSessionRef.current !== null && isFullySignedOut) {
      safeRouter.replace("/(auth)/login");
    }
    prevSessionRef.current = session;
  }, [session, user, loading]);

  useEffect(() => {
    if (loading) return;
    if (!session || !user) return;
    if (!profile) return;
    if (profile.onboarding_completed === false) {
      safeRouter.replace("/onboarding");
    }
  }, [session, user, profile, loading]);

  const isRedirecting =
    (!loading && prevSessionRef.current !== null && !isLoggedIn) ||
    (!loading && isLoggedIn && profile?.onboarding_completed === false);

  if (loading || isRedirecting) {
    return <View style={{ flex: 1, backgroundColor: "transparent" }} />;
  }

  return (
    <TabSwipeProvider>
      <View style={{ flex: 1 }}>
        <ClassicTabLayout isLoggedIn={isLoggedIn} />

        {isLoggedIn && !isDesktop && (
          <CompactTabBar
            userId={user?.id}
            avatarUrl={profile?.avatar_url}
            displayName={profile?.display_name}
          />
        )}

        {isLoggedIn && (
          <Security2FABanner userId={user?.id} />
        )}
      </View>
    </TabSwipeProvider>
  );
}
