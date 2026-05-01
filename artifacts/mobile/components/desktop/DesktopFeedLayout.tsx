/**
 * DesktopFeedLayout — Twitter-style 2-column shell for the Discover feed.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │   [ centered feed column,   max 600px ]   [ right rail 340 ] │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * On mobile this component is a no-op — children render in their normal
 * full-width container. On desktop (web ≥1024px) the feed column is
 * centered and the right rail is mounted alongside it. The right rail is
 * only rendered when the viewport is wide enough (≥1180px) to keep the
 * feed column centered visually.
 */
import React from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";

import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useTheme } from "@/hooks/useTheme";
import { RightRail } from "@/components/desktop/RightRail";

export const FEED_COLUMN_MAX_WIDTH = 620;
export const RIGHT_RAIL_WIDTH = 340;
export const RIGHT_RAIL_BREAKPOINT = 1180;

export function DesktopFeedLayout({ children }: { children: React.ReactNode }) {
  const { isDesktop, width } = useIsDesktop();
  const { colors } = useTheme();

  if (!isDesktop) {
    return <>{children}</>;
  }

  const showRail = width >= RIGHT_RAIL_BREAKPOINT;

  return (
    <View style={[styles.row, { backgroundColor: colors.background }]}>
      {/* Center: feed column with a hairline divider on each side */}
      <View
        style={[
          styles.center,
          {
            maxWidth: FEED_COLUMN_MAX_WIDTH,
            borderColor: colors.border,
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderRightWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {children}
      </View>

      {/* Right: who-to-follow + trending. Scrolls independently. */}
      {showRail ? (
        <View style={[styles.right, { width: RIGHT_RAIL_WIDTH, flexBasis: RIGHT_RAIL_WIDTH }]}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            <RightRail />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "stretch",
    minHeight: 0,
    width: "100%",
  },
  center: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    ...(Platform.OS === "web" ? { overflow: "hidden" as any } : {}),
  },
  right: {
    flexShrink: 0,
    flexGrow: 0,
    ...(Platform.OS === "web" ? { height: "calc(100vh - 56px)" as any } : {}),
  },
});
