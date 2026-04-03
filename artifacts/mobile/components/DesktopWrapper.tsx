import React, { useCallback, useState } from "react";
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

const DESKTOP_BREAKPOINT = 900;

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
  "(auth)",
  "onboarding",
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

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();

  const [activeSection, setActiveSection] = useState<DesktopSection>(() => {
    const fromSegs = sectionFromSegments(segments);
    // When not logged in, always start on discover (public read access)
    if (!session && fromSegs === "chats") return "discover";
    return fromSegs;
  });

  const handleSectionChange = useCallback(
    (section: DesktopSection) => {
      setActiveSection(section);
      if (isDetailRoute(segments)) {
        try {
          router.replace("/(tabs)" as any);
        } catch {
          try { router.back(); } catch {}
        }
      }
    },
    [segments]
  );

  const showOverlay = isDetailRoute(segments);

  const bg = isDark ? "#070709" : "#eef0f5";
  const shellBg = isDark ? "#0f0f12" : "#ffffff";
  const overlayBg = isDark ? "#0f0f12" : "#ffffff";
  const shellShadow = isDark
    ? "0 0 0 1px rgba(255,255,255,0.04), 0 8px 48px rgba(0,0,0,0.6)"
    : "0 0 0 1px rgba(0,0,0,0.06), 0 4px 32px rgba(0,0,0,0.07)";

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <View
        style={[
          styles.shell,
          { backgroundColor: shellBg },
          Platform.OS === "web" && ({ boxShadow: shellShadow } as any),
        ]}
      >
        {session && (
          <DesktopIconRail
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
          />
        )}

        <View style={[styles.mainArea, { borderLeftColor: colors.border }]}>
          {/* Section panels */}
          <View style={styles.sectionLayer}>
            {activeSection === "chats" && <DesktopChatsSection />}
            {activeSection === "discover" && <DesktopDiscoverSection />}
            {activeSection === "search" && <DesktopSearchSection />}
            {activeSection === "notifications" && <DesktopNotificationsSection />}
            {activeSection === "wallet" && <DesktopWalletSection />}
            {activeSection === "profile" && <DesktopProfileSection />}
          </View>

          {/*
           * Detail overlay — always mounted so expo-router stays alive.
           * Uses display:none when on base routes (sections show),
           * display:flex when on a detail route (overlay covers sections).
           */}
          {Platform.OS === "web" && (
            <View
              style={[
                styles.detailOverlay,
                { backgroundColor: overlayBg, display: showOverlay ? "flex" : "none" },
              ]}
            >
              {/* Back header */}
              <View
                style={[
                  styles.overlayHeader,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: overlayBg,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => router.back()}
                  style={styles.backBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={colors.accent}
                  />
                  <Text style={[styles.backText, { color: colors.accent }]}>
                    Back
                  </Text>
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

  if (!isDesktop) {
    return <DesktopDetailProvider>{children}</DesktopDetailProvider>;
  }

  return (
    <DesktopDetailProvider>
      <DesktopShell>{children}</DesktopShell>
    </DesktopDetailProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shell: {
    flex: 1,
    width: "100%" as any,
    maxWidth: 1600,
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
  sectionLayer: {
    flex: 1,
    flexDirection: "row",
  },
  detailOverlay: {
    position: "absolute" as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  overlayContent: {
    flex: 1,
    overflow: "hidden" as any,
  },
});
