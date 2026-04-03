import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSegments } from "expo-router";
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

export type DesktopSection = "chats" | "discover" | "search" | "notifications" | "wallet" | "profile";

function sectionFromSegments(segs: readonly string[]): DesktopSection {
  const flat = segs.join("/");
  if (flat.includes("notifications")) return "notifications";
  if (flat.includes("wallet")) return "wallet";
  if (flat.includes("discover")) return "discover";
  if (flat.includes("search")) return "search";
  if (flat.includes("me")) return "profile";
  return "chats";
}

function DesktopShell({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const segments = useSegments();

  const [activeSection, setActiveSection] = useState<DesktopSection>(() =>
    sectionFromSegments(segments)
  );

  const handleSectionChange = useCallback((section: DesktopSection) => {
    setActiveSection(section);
  }, []);

  const bg = isDark ? "#070709" : "#eef0f5";
  const shellBg = isDark ? "#0f0f12" : "#ffffff";
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
          {activeSection === "chats" && <DesktopChatsSection />}
          {activeSection === "discover" && <DesktopDiscoverSection />}
          {activeSection === "search" && <DesktopSearchSection />}
          {activeSection === "notifications" && <DesktopNotificationsSection />}
          {activeSection === "wallet" && <DesktopWalletSection />}
          {activeSection === "profile" && <DesktopProfileSection />}
        </View>
      </View>

      {Platform.OS === "web" && (
        <View style={styles.hiddenChildren} aria-hidden>
          {children}
        </View>
      )}
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
  },
  hiddenChildren: {
    position: "absolute" as any,
    width: 0,
    height: 0,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none" as any,
  },
});
