import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { DesktopDetailProvider } from "@/context/DesktopDetailContext";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { DesktopTopNav } from "./DesktopSidebar";
import { DesktopChatsSection } from "./desktop/DesktopChatsSection";
import { DesktopDiscoverSection } from "./desktop/DesktopDiscoverSection";
import { DesktopNotificationsSection } from "./desktop/DesktopNotificationsSection";
import { DesktopWalletSection } from "./desktop/DesktopWalletSection";
import { DesktopSearchSection } from "./desktop/DesktopSearchSection";
import { DesktopProfileSection } from "./desktop/DesktopProfileSection";
import { DesktopContactsSection } from "./desktop/DesktopContactsSection";
import { DesktopAppsSection } from "./desktop/DesktopAppsSection";
import { DesktopAISection } from "./desktop/DesktopAISection";
import { DesktopMatchSection } from "./desktop/DesktopMatchSection";
import { DesktopSettingsSection } from "./desktop/DesktopSettingsSection";

const DESKTOP_BREAKPOINT = 960;

export type DesktopSection =
  | "chats"
  | "discover"
  | "search"
  | "notifications"
  | "wallet"
  | "contacts"
  | "profile"
  | "apps"
  | "ai"
  | "match"
  | "settings";

const AUTHED_SECTIONS: DesktopSection[] = [
  "chats", "notifications", "wallet", "profile", "ai", "match", "settings",
];

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
  if (flat.includes("ai")) return "ai";
  if (flat.includes("match")) return "match";
  if (flat.includes("apps")) return "apps";
  if (flat.includes("settings")) return "settings";
  return "discover";
}

function isDetailRoute(segs: readonly string[]): boolean {
  if (segs.length === 0) return false;
  return !BASE_FIRST_SEGMENTS.has(segs[0]);
}

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();

  const [activeSection, setActiveSection] = useState<DesktopSection>(() => {
    const fromSegs = sectionFromSegments(segments);
    if (!session && AUTHED_SECTIONS.includes(fromSegs)) return "discover";
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
      // Guard authed sections
      if (!session && AUTHED_SECTIONS.includes(section)) {
        router.push("/(auth)/login" as any);
        return;
      }
      setActiveSection(section);
      if (isDetailRoute(segments)) {
        try { router.replace("/(tabs)" as any); } catch { try { router.back(); } catch {} }
      }
    },
    [segments, session]
  );

  const showModal = isDetailRoute(segments);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <DesktopTopNav
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        hasSession={!!session}
      />

      <View style={styles.mainArea}>
        <View style={styles.sectionLayer}>
          {activeSection === "chats"         && <DesktopChatsSection />}
          {activeSection === "discover"      && <DesktopDiscoverSection />}
          {activeSection === "search"        && <DesktopSearchSection />}
          {activeSection === "notifications" && <DesktopNotificationsSection />}
          {activeSection === "wallet"        && <DesktopWalletSection />}
          {activeSection === "contacts"      && <DesktopContactsSection />}
          {activeSection === "profile"       && <DesktopProfileSection />}
          {activeSection === "apps"          && <DesktopAppsSection onNavigate={handleSectionChange} />}
          {activeSection === "ai"            && <DesktopAISection />}
          {activeSection === "match"         && <DesktopMatchSection />}
          {activeSection === "settings"      && <DesktopSettingsSection />}
        </View>
      </View>

      {Platform.OS === "web" && showModal && (
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.backdropPress}
            onPress={() => {
              try { router.back(); } catch { router.replace("/(tabs)" as any); }
            }}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                onPress={() => {
                  try { router.back(); } catch { router.replace("/(tabs)" as any); }
                }}
                style={[styles.closeBtn, { backgroundColor: colors.textMuted + "14" }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalContent}>{children}</View>
          </View>
        </View>
      )}
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

const styles = StyleSheet.create<any>({
  root: { flex: 1, flexDirection: "column" },
  mainArea: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  sectionLayer: { flex: 1, flexDirection: "row" },

  // Modal overlay for detail routes
  modalBackdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 500,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdropPress: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
  },
  modalSheet: {
    width: "56%",
    maxWidth: 740,
    minWidth: 500,
    height: "84%",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "column",
    zIndex: 501,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 20,
  },
  modalHeader: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: { flex: 1, overflow: "hidden" },
});
