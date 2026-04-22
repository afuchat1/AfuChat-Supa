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
import { DesktopSidebar } from "./DesktopSidebar";
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

const BASE_FIRST_SEGMENTS = new Set(["", "index", "(tabs)", "+html", "+not-found"]);

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
      if (!session && AUTHED_SECTIONS.includes(section)) {
        router.push("/(auth)/login" as any);
        return;
      }
      setActiveSection(section);
      if (isDetailRoute(segments)) {
        try { router.replace("/(tabs)" as any); } catch { try { router.back(); } catch {} }
      }
    },
    [segments, session],
  );

  const showModal = isDetailRoute(segments);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent left sidebar */}
      <DesktopSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        hasSession={!!session}
      />

      {/* Main canvas */}
      <View style={[styles.main, { backgroundColor: colors.background }]}>
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

      {/* Detail-route modal overlay */}
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
              <View style={styles.modalDots}>
                <View style={[styles.modalDot, { backgroundColor: "#FF5F57" }]} />
                <View style={[styles.modalDot, { backgroundColor: "#FEBC2E" }]} />
                <View style={[styles.modalDot, { backgroundColor: "#28C840" }]} />
              </View>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => {
                  try { router.back(); } catch { router.replace("/(tabs)" as any); }
                }}
                style={[styles.closeBtn, { backgroundColor: colors.text + "0F" }]}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={16} color={colors.text} />
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
  root: { flex: 1, flexDirection: "row" },
  main: { flex: 1, flexDirection: "column", overflow: "hidden" },
  sectionLayer: { flex: 1, flexDirection: "row" },

  modalBackdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 500,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 12, 20, 0.55)",
    // @ts-ignore
    backdropFilter: "blur(6px)",
  },
  backdropPress: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modalSheet: {
    width: "62%",
    maxWidth: 880,
    minWidth: 540,
    height: "86%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "column",
    zIndex: 501,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.32,
    shadowRadius: 60,
    elevation: 24,
  },
  modalHeader: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    gap: 12,
  },
  modalDots: { flexDirection: "row", gap: 6 },
  modalDot: { width: 11, height: 11, borderRadius: 6 },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: { flex: 1, overflow: "hidden" },
});
