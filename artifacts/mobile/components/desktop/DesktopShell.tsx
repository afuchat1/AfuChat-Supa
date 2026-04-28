import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useTheme } from "@/hooks/useTheme";
import { DesktopSidebar } from "@/components/desktop/DesktopSidebar";

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
  { pattern: /^\/apps\/submit/, title: "Submit an app" },
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

  // Fullscreen takeovers (auth, onboarding, calls, splash, video) – no shell.
  if (isFullscreen(pathname)) {
    return <>{children}</>;
  }

  const bg = isDark ? "#000000" : "#FFFFFF";
  const contentBg = isDark ? "#000000" : "#FDF8F3";
  const modalBackdrop = isDark ? "rgba(0,0,0,0.65)" : "rgba(20,20,30,0.45)";
  const modalCardBg = isDark ? "#0E0E10" : "#FFFFFF";
  const modalBorder = isDark ? "#1F1F23" : "#E6E7EB";
  const modalHeaderText = isDark ? "#F2F2F2" : "#1A1A1A";

  const modal = matchModal(pathname);

  return (
    <View
      style={[styles.root, { backgroundColor: bg }]}
      // @ts-expect-error react-native-web maps dataSet to data-* attributes
      dataSet={{ font: "system" }}
    >
      <DesktopSidebar />
      <View style={[styles.main, { backgroundColor: contentBg }]}>
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
        ) : (
          <View style={styles.content}>{children}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
  },
  main: {
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
  content: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
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
