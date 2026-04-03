import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DesktopDetailProvider } from "@/context/DesktopDetailContext";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { DesktopIconRail } from "./DesktopSidebar";
import { DesktopChatsSection } from "./desktop/DesktopChatsSection";
import { DesktopDiscoverSection } from "./desktop/DesktopDiscoverSection";
import { DesktopNotificationsSection } from "./desktop/DesktopNotificationsSection";
import { DesktopWalletSection } from "./desktop/DesktopWalletSection";
import { DesktopSearchSection } from "./desktop/DesktopSearchSection";
import { DesktopProfileSection } from "./desktop/DesktopProfileSection";

const DESKTOP_BREAKPOINT = 960;

export type DesktopSection =
  | "chats"
  | "discover"
  | "search"
  | "notifications"
  | "wallet"
  | "profile";

const BASE_FIRST_SEGMENTS = new Set([
  "",
  "index",
  "(tabs)",
  "+html",
  "+not-found",
]);

function sectionFromSegments(segs: readonly string[]): DesktopSection {
  const flat = segs.join("/");
  if (flat.includes("notifications")) return "notifications";
  if (flat.includes("wallet")) return "wallet";
  if (flat.includes("discover")) return "discover";
  if (flat.includes("search")) return "search";
  if (flat.includes("me")) return "profile";
  return "chats";
}

function isDetailRoute(segs: readonly string[]): boolean {
  if (segs.length === 0) return false;
  return !BASE_FIRST_SEGMENTS.has(segs[0]);
}

function GuestSidebar() {
  const { colors } = useTheme();
  return (
    <View style={[gs.sidebar, { backgroundColor: colors.background, borderRightColor: colors.border }]}>
      <View style={[gs.logoCircle, { backgroundColor: colors.accent }]}>
        <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
      </View>
      <TouchableOpacity
        onPress={() => router.push("/(auth)/login" as any)}
        style={[gs.signInBtn, { backgroundColor: colors.accent }]}
        activeOpacity={0.85}
      >
        <Ionicons name="log-in-outline" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const gs = StyleSheet.create({
  sidebar: {
    width: 68,
    flexShrink: 0,
    alignItems: "center",
    paddingVertical: 12,
    gap: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  signInBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();

  const [activeSection, setActiveSection] = useState<DesktopSection>(() => {
    const fromSegs = sectionFromSegments(segments);
    if (!session && (fromSegs === "chats" || fromSegs === "notifications" || fromSegs === "wallet" || fromSegs === "profile")) {
      return "discover";
    }
    return fromSegs;
  });

  const prevSessionRef = useRef(session);
  useEffect(() => {
    const wasLoggedIn = !!prevSessionRef.current;
    const isLoggedIn = !!session;
    if (wasLoggedIn && !isLoggedIn) setActiveSection("discover");
    prevSessionRef.current = session;
  }, [session]);

  const handleSectionChange = useCallback(
    (section: DesktopSection) => {
      setActiveSection(section);
      if (isDetailRoute(segments)) {
        try { router.replace("/(tabs)" as any); } catch { try { router.back(); } catch {} }
      }
    },
    [segments]
  );

  const showOverlay = isDetailRoute(segments);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.shell, { backgroundColor: colors.background }]}>
        {session ? (
          <DesktopIconRail activeSection={activeSection} onSectionChange={handleSectionChange} />
        ) : (
          <GuestSidebar />
        )}

        <View style={[styles.mainArea, { borderLeftColor: colors.border }]}>
          <View style={styles.sectionLayer}>
            {activeSection === "chats" && <DesktopChatsSection />}
            {activeSection === "discover" && <DesktopDiscoverSection />}
            {activeSection === "search" && <DesktopSearchSection />}
            {activeSection === "notifications" && <DesktopNotificationsSection />}
            {activeSection === "wallet" && <DesktopWalletSection />}
            {activeSection === "profile" && <DesktopProfileSection />}
          </View>

          {Platform.OS === "web" && (
            <View
              style={[
                styles.detailOverlay,
                { backgroundColor: colors.background, display: showOverlay ? "flex" : "none" },
              ]}
            >
              <View style={[styles.overlayHeader, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
                <TouchableOpacity
                  onPress={() => {
                    try { router.back(); } catch { router.replace("/(tabs)" as any); }
                  }}
                  style={styles.backBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.overlayContent}>{children}</View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export function DesktopWrapper({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  if (!isDesktop) return <DesktopDetailProvider>{children}</DesktopDetailProvider>;

  return (
    <DesktopDetailProvider>
      <DesktopShell>{children}</DesktopShell>
    </DesktopDetailProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: {
    flex: 1,
    maxWidth: 1280,
    alignSelf: "center" as any,
    width: "100%" as any,
    flexDirection: "row",
    overflow: "hidden",
  },
  mainArea: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
    borderLeftWidth: StyleSheet.hairlineWidth,
    position: "relative" as any,
  },
  sectionLayer: { flex: 1, flexDirection: "row" },
  detailOverlay: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 10,
    flexDirection: "column",
  },
  overlayHeader: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  overlayContent: { flex: 1, overflow: "hidden" as any },
});
