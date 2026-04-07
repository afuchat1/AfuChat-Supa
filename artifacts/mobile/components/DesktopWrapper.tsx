import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
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

const DESKTOP_BREAKPOINT = 960;

export type DesktopSection =
  | "chats"
  | "discover"
  | "search"
  | "notifications"
  | "wallet"
  | "contacts"
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

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
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

  const showModal = isDetailRoute(segments);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <DesktopTopNav
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        hasSession={!!session}
      />

      <View style={[styles.mainArea, { borderTopColor: colors.border }]}>
        <View style={styles.sectionLayer}>
          {activeSection === "chats" && <DesktopChatsSection />}
          {activeSection === "discover" && <DesktopDiscoverSection />}
          {activeSection === "search" && <DesktopSearchSection />}
          {activeSection === "notifications" && <DesktopNotificationsSection />}
          {activeSection === "wallet" && <DesktopWalletSection />}
          {activeSection === "contacts" && <DesktopContactsSection />}
          {activeSection === "profile" && <DesktopProfileSection />}
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
                style={styles.closeBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color={colors.text} />
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

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "column" as any },
  mainArea: {
    flex: 1,
    flexDirection: "row" as any,
    overflow: "hidden" as any,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionLayer: { flex: 1, flexDirection: "row" as any },
  modalBackdrop: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100,
    alignItems: "center" as any,
    justifyContent: "center" as any,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  backdropPress: {
    position: "absolute" as any,
    top: 0, left: 0, right: 0, bottom: 0,
  },
  modalSheet: {
    width: "54%" as any,
    maxWidth: 720,
    minWidth: 480,
    height: "82%" as any,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden" as any,
    flexDirection: "column" as any,
    zIndex: 1,
  },
  modalHeader: {
    height: 48,
    flexDirection: "row" as any,
    alignItems: "center" as any,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: "center" as any,
    justifyContent: "center" as any,
  },
  modalContent: { flex: 1, overflow: "hidden" as any },
});
