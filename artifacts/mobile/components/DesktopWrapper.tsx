import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
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
import { useDesktopTheme } from "./desktop/ui";

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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Pretty title for the detail-route modal — derived from current path segments.
 *  Falls back to "Details" when nothing matches.
 * ──────────────────────────────────────────────────────────────────────────── */

const SEG_TITLES: Record<string, string> = {
  post: "Post",
  channel: "Channel",
  group: "Group",
  story: "Story",
  stories: "Story",
  video: "Video",
  videos: "Videos",
  article: "Article",
  profile: "Profile",
  user: "Profile",
  contact: "Contact",
  wallet: "Wallet",
  premium: "Premium",
  monetize: "Monetize",
  events: "Events",
  store: "Marketplace",
  freelance: "Freelance",
  saved: "Saved",
  saved_posts: "Saved posts",
  bookmarks: "Bookmarks",
  notifications: "Notifications",
  achievements: "Achievements",
  prestige: "Prestige",
  digital_id: "Digital ID",
  referral: "Referral",
  match: "Match",
  ai: "AfuAI",
  apps: "Apps",
  admin: "Admin panel",
  settings: "Settings",
  help: "Help center",
  search: "Search",
  edit: "Edit",
  create: "Create",
  topup: "Top-up",
  transfer: "Transfer",
};

function titleFromSegments(segs: readonly string[]): string {
  for (const raw of segs) {
    const key = raw.replace(/^\(/, "").replace(/\)$/, "").replace(/-/g, "_").toLowerCase();
    if (SEG_TITLES[key]) return SEG_TITLES[key];
  }
  return "Details";
}

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

/* ─────────────────────────────────────────────────────────────────────────────
 *  Detail-route modal — pro centered card, blurred backdrop, ESC to close.
 *  Replaces the old fake-macOS-window look with a clean app-modal pattern.
 * ──────────────────────────────────────────────────────────────────────────── */

function DetailModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useDesktopTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.97)).current;
  const translate = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(scale, { toValue: 1, tension: 200, friction: 20, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(translate, { toValue: 0, tension: 200, friction: 20, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Animated.View
      style={[
        styles.modalBackdrop,
        {
          backgroundColor: t.modalBackdrop,
          opacity,
          ...(Platform.OS === "web" ? ({ backdropFilter: "blur(8px)" } as any) : {}),
        },
      ]}
    >
      <Pressable style={styles.backdropPress} onPress={onClose} />
      <Animated.View
        style={[
          styles.modalSheet,
          {
            backgroundColor: t.panelBg,
            borderColor: t.borderStrong,
            transform: [{ scale }, { translateY: translate }],
            ...(Platform.OS === "web"
              ? ({
                  boxShadow:
                    "0 30px 80px rgba(0,0,0,0.34), 0 6px 18px rgba(0,0,0,0.14)",
                } as any)
              : {}),
          },
        ]}
      >
        <View
          style={[
            styles.modalHeader,
            { borderBottomColor: t.border, backgroundColor: t.panelHeaderBg },
          ]}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: t.accent + "1A",
            }}
          >
            <Ionicons name="albums-outline" size={15} color={t.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 15,
                color: t.text,
                letterSpacing: -0.2,
              }}
            >
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                color: t.textMuted,
              }}
            >
              Press Esc to close
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.85}
            style={[styles.headerBtn, { backgroundColor: t.chipBg }]}
          >
            <Ionicons name="close" size={15} color={t.text} />
          </TouchableOpacity>
        </View>
        <View style={[styles.modalContent, { backgroundColor: t.panelBg }]}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const t = useDesktopTheme();
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
  const modalTitle = showModal ? titleFromSegments(segments) : "Details";

  const closeModal = useCallback(() => {
    try { router.back(); } catch { router.replace("/(tabs)" as any); }
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: t.appBg }]}>
      {/* Persistent left sidebar */}
      <DesktopSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        hasSession={!!session}
      />

      {/* Main canvas */}
      <View style={[styles.main, { backgroundColor: t.contentBg }]}>
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
        <DetailModal title={modalTitle} onClose={closeModal}>
          {children}
        </DetailModal>
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
  },
  backdropPress: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  modalSheet: {
    width: "70%",
    maxWidth: 1000,
    minWidth: 580,
    height: "88%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    flexDirection: "column",
    zIndex: 501,
  },
  modalHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    gap: 12,
  },
  headerBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: { flex: 1, overflow: "hidden" },
});
