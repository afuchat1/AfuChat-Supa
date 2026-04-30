/**
 * Desktop shell — fully rebuilt.
 *
 * Layout contract:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ ┌──────────┐ ┌──────────────────────────────────────┐   │
 *   │ │ SIDEBAR  │ │ MAIN CONTENT (route children)        │   │
 *   │ │ FIXED    │ │ scrolls independently                │   │
 *   │ │ 248px    │ │                                      │   │
 *   │ └──────────┘ └──────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Behaviour:
 *   • The sidebar uses `position: fixed` on web so it never moves when the
 *     content area scrolls and its width is locked at SIDEBAR_WIDTH.
 *   • The main column reserves that exact same width via `paddingLeft` so
 *     content never slides under the sidebar and the layout doesn't shift
 *     between routes.
 *   • Fullscreen routes (auth, onboarding, calls, splash, video, story
 *     viewer/camera) bypass the shell entirely.
 *   • A small set of "modal-style" routes are rendered as a centred card on
 *     top of a backdrop, while still keeping the sidebar visible behind it.
 */
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useTheme } from "@/hooks/useTheme";
import {
  DesktopSidebar,
  SIDEBAR_WIDTH,
} from "@/components/desktop/DesktopSidebar";
import {
  DesktopTopBar,
  TOPBAR_HEIGHT,
} from "@/components/desktop/DesktopTopBar";
import { ChatsListPanel } from "@/app/(tabs)/index";

const FULLSCREEN_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/index$/,
  /^\/\(auth\)/,
  /^\/onboarding/,
  /^\/call(\/|$)/,
  /^\/video\//,
  /^\/stories\/(view|camera)/,
];

const MODAL_PATTERNS: { pattern: RegExp; title: string }[] = [
  { pattern: /^\/profile\/edit/, title: "Edit profile" },
  { pattern: /^\/moments\/create/, title: "New moment" },
  { pattern: /^\/group\/create/, title: "New group" },
  { pattern: /^\/stories\/create/, title: "New story" },
  { pattern: /^\/red-envelope\//, title: "Red envelope" },
  { pattern: /^\/terms$/, title: "Terms of Service" },
  { pattern: /^\/privacy$/, title: "Privacy Policy" },
  { pattern: /^\/mini-programs\/transfer/, title: "Transfer" },
  { pattern: /^\/mini-programs\/fee-details/, title: "Fee details" },
  { pattern: /^\/language-settings/, title: "Language" },
  { pattern: /^\/linked-accounts/, title: "Linked accounts" },
];

function matchModal(pathname: string) {
  for (const m of MODAL_PATTERNS) {
    if (m.pattern.test(pathname)) return m;
  }
  return null;
}

function isFullscreen(pathname: string) {
  return FULLSCREEN_PATTERNS.some((rx) => rx.test(pathname));
}

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useIsDesktop();
  const { isDark } = useTheme();
  const pathname = usePathname() || "/";

  if (!isDesktop) {
    return <>{children}</>;
  }

  if (isFullscreen(pathname)) {
    return <>{children}</>;
  }

  // Flat / YouTube-style: a single surface color across sidebar, top bar
  // and main content area. No tonal borders between regions.
  const bg = isDark ? "#0F0F0F" : "#FFFFFF";
  const contentBg = bg;
  const modalBackdrop = isDark ? "rgba(0,0,0,0.7)" : "rgba(15,15,15,0.55)";
  const modalCardBg = isDark ? "#181818" : "#FFFFFF";
  const modalBorder = isDark ? "#272727" : "#E5E5E5";
  const modalHeaderText = isDark ? "#F1F1F1" : "#0F0F0F";

  const modal = matchModal(pathname);
  // WhatsApp/Telegram-style master-detail: when a chat conversation is open
  // (/chat/[id]) we render the chats list as a sticky 360px panel on the
  // left and the chat conversation to its right. The chats list is owned
  // by `ChatsListPanel` so it stays mounted when navigating between chats.
  const isChatRoute = /^\/chat\/[^/]+/.test(pathname);

  // On web we glue the sidebar to the viewport so scrolling content never
  // moves it. On native (rare path: this component only mounts when the
  // viewport hits the desktop breakpoint, which only really happens on web)
  // we fall back to the original flex-row layout.
  const sidebarStyle =
    Platform.OS === "web"
      ? [
          styles.sidebarFixed,
          { width: SIDEBAR_WIDTH, height: "100vh" as any },
        ]
      : [styles.sidebarFlex, { width: SIDEBAR_WIDTH }];

  const topBarStyle =
    Platform.OS === "web"
      ? [
          styles.topBarFixed,
          { left: SIDEBAR_WIDTH, height: TOPBAR_HEIGHT },
        ]
      : null;

  const mainStyle =
    Platform.OS === "web"
      ? [
          styles.mainWeb,
          {
            backgroundColor: contentBg,
            paddingLeft: SIDEBAR_WIDTH,
            paddingTop: TOPBAR_HEIGHT,
            minHeight: "100vh" as any,
          },
        ]
      : [styles.mainNative, { backgroundColor: contentBg }];

  return (
    <View
      style={[
        Platform.OS === "web" ? styles.rootWeb : styles.rootNative,
        { backgroundColor: bg },
      ]}
      // @ts-expect-error react-native-web maps dataSet to data-* attributes
      dataSet={{ font: "system" }}
    >
      <View style={sidebarStyle}>
        <DesktopSidebar />
      </View>

      {topBarStyle ? (
        <View style={topBarStyle}>
          <DesktopTopBar />
        </View>
      ) : null}

      <View style={mainStyle}>
        {modal ? (
          <View style={[styles.backdrop, { backgroundColor: modalBackdrop }]}>
            <View
              style={[
                styles.modalCard,
                { backgroundColor: modalCardBg, borderColor: modalBorder },
              ]}
            >
              <View
                style={[styles.modalHeader, { borderBottomColor: modalBorder }]}
              >
                <Text style={[styles.modalTitle, { color: modalHeaderText }]}>
                  {modal.title}
                </Text>
                <Pressable
                  onPress={() => {
                    if (router.canGoBack()) {
                      router.back();
                    } else {
                      router.replace("/(tabs)" as any);
                    }
                  }}
                  style={({ hovered }: any) => [
                    styles.modalClose,
                    { opacity: hovered ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons name="close" size={20} color={modalHeaderText} />
                </Pressable>
              </View>
              <View style={styles.modalBody}>{children}</View>
            </View>
          </View>
        ) : isChatRoute ? (
          <View style={styles.masterDetail}>
            <ChatsListPanel />
            <View style={styles.detailColumn}>{children}</View>
          </View>
        ) : (
          <View style={styles.content}>{children}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWeb: {
    flex: 1,
    minHeight: "100vh" as any,
  },
  rootNative: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
  },
  sidebarFixed: {
    position: "fixed" as any,
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 50,
  },
  sidebarFlex: {
    height: "100%",
  },
  topBarFixed: {
    position: "fixed" as any,
    top: 0,
    right: 0,
    zIndex: 40,
  },
  mainWeb: {
    flex: 1,
    minWidth: 0,
  },
  mainNative: {
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
  content: {
    flex: 1,
  },
  masterDetail: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  detailColumn: {
    flex: 1,
    minWidth: 0,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    minHeight: "100vh" as any,
  },
  modalCard: {
    width: "100%",
    maxWidth: 720,
    height: "100%",
    maxHeight: 720,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "column",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  modalClose: {
    padding: 4,
    borderRadius: 6,
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
});
