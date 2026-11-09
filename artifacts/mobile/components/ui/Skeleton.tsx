import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type SkeletonProps = {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  forceDark?: boolean;
};

// ── Opacity pulse via the built-in native-driver Animated API ────────────────
// Keep this component independent of Reanimated. Skeletons mount on nearly
// every loading path, so they must not be able to take down the app when the
// Reanimated/Worklets native runtime is unavailable or mismatched.
function SkeletonFallback({ width, height, borderRadius = 8, style, forceDark }: SkeletonProps) {
  const { isDark } = useTheme();
  const useDark = forceDark ?? isDark;
  const baseColor      = useDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const highlightColor = useDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.09)";
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const op = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });

  return (
    <View style={[{ width: width as any, height, borderRadius, backgroundColor: baseColor, overflow: "hidden" }, style]}>
      <Animated.View
        style={{ position: "absolute", inset: 0, backgroundColor: highlightColor, opacity: op }}
      />
    </View>
  );
}

export function Skeleton(props: SkeletonProps) {
  return <SkeletonFallback {...props} />;
}

export function ChatRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.row, { borderBottomColor: colors.border }]}>
      <Skeleton width={50} height={50} borderRadius={25} />
      <View style={sk.rowContent}>
        <View style={sk.rowTop}>
          <Skeleton width={140} height={14} />
          <Skeleton width={40} height={12} />
        </View>
        <Skeleton width={200} height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function ContactRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.row, { borderBottomColor: colors.border }]}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={sk.rowContent}>
        <Skeleton width={120} height={14} />
        <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

export function PostSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.postCard, { backgroundColor: colors.surface }]}>
      <View style={sk.postHeader}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={{ marginLeft: 10, flex: 1, gap: 6 }}>
          <Skeleton width={130} height={13} borderRadius={6} />
          <Skeleton width={80} height={11} borderRadius={5} />
        </View>
      </View>
      <View style={{ paddingLeft: 50, gap: 6, marginTop: 10 }}>
        <Skeleton width="96%" height={13} borderRadius={5} />
        <Skeleton width="82%" height={13} borderRadius={5} />
        <Skeleton width="68%" height={13} borderRadius={5} />
      </View>
      <View style={{ paddingLeft: 50, marginTop: 8 }}>
        <Skeleton width="94%" height={140} borderRadius={10} />
      </View>
      <View style={[sk.postActions, { paddingLeft: 44 }]}>
        <Skeleton width={46} height={18} borderRadius={9} />
        <Skeleton width={46} height={18} borderRadius={9} />
        <Skeleton width={46} height={18} borderRadius={9} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 }}>
        <Skeleton width={78} height={78} borderRadius={39} />
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around", marginLeft: 18 }}>
          {[["32", "48"], ["44", "64"], ["36", "56"]].map(([nw, lw], i) => (
            <View key={i} style={{ alignItems: "center", gap: 5 }}>
              <Skeleton width={Number(nw)} height={18} borderRadius={5} />
              <Skeleton width={Number(lw)} height={11} borderRadius={4} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 7 }}>
        <Skeleton width={150} height={16} borderRadius={5} />
        <Skeleton width={40} height={16} borderRadius={8} />
      </View>
      <Skeleton width="88%" height={13} borderRadius={4} style={{ marginHorizontal: 16, marginBottom: 5 }} />
      <Skeleton width="65%" height={13} borderRadius={4} style={{ marginHorizontal: 16, marginBottom: 14 }} />
      <View style={{ flexDirection: "row", height: 44, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.border }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Skeleton width={22} height={22} borderRadius={4} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width="32.5%" height={110} borderRadius={0} />
        ))}
      </View>
    </View>
  );
}

// ─── Contact profile skeleton — mirrors contact/[id].tsx layout exactly ───────
export function ContactProfileSkeleton() {
  const { colors, isDark } = useTheme();
  const BANNER_H    = 100;
  const AVATAR_SIZE = 80;
  const SHELL       = AVATAR_SIZE + 6;           // 86
  const NEG_TOP     = -(AVATAR_SIZE / 2 + 4);   // -44
  const RIGHT_PT    = (AVATAR_SIZE / 2 + 4) + 6; // 50
  const CELL_SIZE   = 110;

  const chipBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Banner ── */}
      <Skeleton width="100%" height={BANNER_H} borderRadius={0} />

      {/* ── Identity band ── */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>

        {/* Left col */}
        <View style={{ flex: 1, gap: 6 }}>
          {/* Avatar overlapping banner */}
          <Skeleton
            width={SHELL} height={SHELL} borderRadius={SHELL / 2}
            style={{ marginTop: NEG_TOP }}
          />
          {/* Display name */}
          <Skeleton width={130} height={15} borderRadius={5} />
          {/* Handle */}
          <Skeleton width={80} height={12} borderRadius={4} />
          {/* Pill action row: prestige pill + 4 icon circles */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", width: "100%", marginTop: 2 }}>
            <Skeleton width={68} height={26} borderRadius={13} />
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} width={36} height={36} borderRadius={18} />
            ))}
          </View>
        </View>

        {/* Right col — Follow button, padded down to sit below banner */}
        <View style={{ paddingTop: RIGHT_PT }}>
          <Skeleton width={80} height={30} borderRadius={15} />
        </View>
      </View>

      {/* ── Stats card ── */}
      <View style={{
        flexDirection: "row", marginHorizontal: 14, marginBottom: 10,
        borderRadius: 14, borderWidth: 0.5,
        borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
        paddingVertical: 12,
      }}>
        {["Posts", "Followers", "Following"].map((_, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <View style={{ width: 0.5, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)" }} />
            )}
            <View style={{ flex: 1, alignItems: "center", gap: 5 }}>
              <Skeleton width={36} height={16} borderRadius={5} />
              <Skeleton width={52} height={11} borderRadius={4} />
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* ── Bio (2 lines) ── */}
      <Skeleton width="88%" height={13} borderRadius={4} style={{ marginHorizontal: 14, marginBottom: 5 }} />
      <Skeleton width="66%" height={13} borderRadius={4} style={{ marginHorizontal: 14, marginBottom: 10 }} />

      {/* ── Meta chips ── */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, marginBottom: 10 }}>
        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: chipBg, justifyContent: "center" }}>
          <Skeleton width={70} height={10} borderRadius={4} />
        </View>
        <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: chipBg, justifyContent: "center" }}>
          <Skeleton width={55} height={10} borderRadius={4} />
        </View>
      </View>

      {/* ── Tab bar: Posts / Articles / Videos ── */}
      <View style={{ flexDirection: "row", height: 44, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: colors.border }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Skeleton width={20} height={20} borderRadius={4} />
            <Skeleton width={i === 0 ? 32 : i === 1 ? 44 : 36} height={9} borderRadius={3} />
            {i === 0 && (
              <View style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2, borderRadius: 1, backgroundColor: colors.accent, opacity: 0.5 }} />
            )}
          </View>
        ))}
      </View>

      {/* ── 3-column grid (6 cells) ── */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width="32.5%" height={CELL_SIZE} borderRadius={0} />
        ))}
      </View>
    </View>
  );
}

export function GiftCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.giftCard, { backgroundColor: colors.surface }]}>
      <Skeleton width={40} height={40} borderRadius={8} />
      <Skeleton width={60} height={12} style={{ marginTop: 6 }} />
      <Skeleton width={50} height={10} style={{ marginTop: 4 }} />
    </View>
  );
}

export function WalletSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Skeleton width="100%" height={140} borderRadius={20} />
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Skeleton width="30%" height={36} borderRadius={20} />
        <Skeleton width="30%" height={36} borderRadius={20} />
        <Skeleton width="30%" height={36} borderRadius={20} />
      </View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[sk.row, { borderBottomColor: colors.border }]}>
          <Skeleton width={40} height={40} borderRadius={20} />
          <View style={sk.rowContent}>
            <Skeleton width={120} height={14} />
            <Skeleton width={80} height={12} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={60} height={16} />
        </View>
      ))}
    </View>
  );
}

export function PostDetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, gap: 12, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Skeleton width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width={130} height={15} borderRadius={6} />
          <Skeleton width={90} height={11} borderRadius={5} />
        </View>
      </View>
      <Skeleton width="100%" height={15} borderRadius={5} style={{ marginTop: 4 }} />
      <Skeleton width="90%" height={15} borderRadius={5} />
      <Skeleton width="76%" height={15} borderRadius={5} />
      <Skeleton width="100%" height={200} borderRadius={12} style={{ marginTop: 6 }} />
      <Skeleton width={140} height={12} borderRadius={5} style={{ marginTop: 4 }} />
      <View style={{ flexDirection: "row", gap: 28, marginTop: 8 }}>
        <Skeleton width={52} height={20} borderRadius={10} />
        <Skeleton width={52} height={20} borderRadius={10} />
        <Skeleton width={52} height={20} borderRadius={10} />
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginTop: 8 }} />
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, paddingTop: 8 }}>
          <Skeleton width={34} height={34} borderRadius={17} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={110} height={13} borderRadius={5} />
            <Skeleton width="88%" height={13} borderRadius={5} />
            <Skeleton width="65%" height={13} borderRadius={5} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListRowSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.row, { borderBottomColor: colors.border }]}>
      <Skeleton width={52} height={52} borderRadius={12} />
      <View style={sk.rowContent}>
        <Skeleton width={140} height={14} />
        <Skeleton width={100} height={12} style={{ marginTop: 6 }} />
        <Skeleton width={80} height={10} style={{ marginTop: 4 }} />
      </View>
      <Skeleton width={50} height={28} borderRadius={14} />
    </View>
  );
}

export function GameCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.gameCard, { backgroundColor: colors.surface }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Skeleton width={60} height={20} borderRadius={8} />
        <Skeleton width={100} height={14} />
        <Skeleton width={50} height={14} />
      </View>
      <Skeleton width={180} height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

export function PremiumSkeleton() {
  return (
    <View style={{ padding: 20, gap: 20, alignItems: "center" }}>
      <Skeleton width={72} height={72} borderRadius={36} />
      <Skeleton width={200} height={24} />
      <Skeleton width={260} height={14} />
      <View style={{ width: "100%", gap: 8, marginTop: 16 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={60} borderRadius={12} />
        ))}
      </View>
      <View style={{ width: "100%", gap: 10, marginTop: 16 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={80} borderRadius={14} />
        ))}
      </View>
    </View>
  );
}

export function AdminSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Skeleton width={160} height={20} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} width="47%" height={80} borderRadius={12} />
        ))}
      </View>
    </View>
  );
}

export function MarketplaceCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.marketCard, { backgroundColor: colors.surface }]}>
      <Skeleton width="100%" height={100} borderRadius={10} />
      <View style={{ padding: 8, gap: 6 }}>
        <Skeleton width={80} height={14} />
        <Skeleton width={60} height={12} />
        <Skeleton width={70} height={16} borderRadius={10} />
      </View>
    </View>
  );
}

const BUBBLE_WIDTHS: [number, "left" | "right"][] = [
  [160, "left"], [120, "right"], [200, "left"], [140, "right"], [180, "left"],
];

export function ChatBubbleSkeleton({ align, width = 160 }: { align: "left" | "right"; width?: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: align === "right" ? "flex-end" : "flex-start", paddingHorizontal: 12, marginVertical: 3 }}>
      {align === "left" && <Skeleton width={32} height={32} borderRadius={16} style={{ marginRight: 8, alignSelf: "flex-end" }} />}
      <View style={{ gap: 4, maxWidth: "75%" }}>
        <Skeleton width={width} height={38} borderRadius={18} />
        <View style={{ flexDirection: "row", justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
          <Skeleton width={40} height={10} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function ChatLoadingSkeleton() {
  return (
    <View style={{ flex: 1, padding: 8, justifyContent: "flex-end", gap: 2 }}>
      {BUBBLE_WIDTHS.map(([w, side], i) => (
        <ChatBubbleSkeleton key={i} align={side} width={w} />
      ))}
    </View>
  );
}

export function FreelanceCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 12, marginVertical: 5, overflow: "hidden" }}>
      <Skeleton width="100%" height={110} borderRadius={0} />
      <View style={{ padding: 12, gap: 7 }}>
        <Skeleton width={180} height={14} />
        <Skeleton width={120} height={12} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
          <Skeleton width={60} height={20} borderRadius={10} />
          <Skeleton width={70} height={20} borderRadius={10} />
        </View>
      </View>
    </View>
  );
}

export function EventCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, marginHorizontal: 12, marginVertical: 5, overflow: "hidden" }}>
      <Skeleton width="100%" height={120} borderRadius={0} />
      <View style={{ padding: 12, gap: 8 }}>
        <Skeleton width={200} height={15} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Skeleton width={80} height={12} />
          <Skeleton width={60} height={12} />
        </View>
        <Skeleton width={100} height={24} borderRadius={12} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

export function MeTabSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary, padding: 16, gap: 12 }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Skeleton width={68} height={68} borderRadius={34} />
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Skeleton width={130} height={17} borderRadius={5} />
            <Skeleton width={18} height={18} borderRadius={9} />
          </View>
          <Skeleton width={80} height={13} borderRadius={4} />
          <Skeleton width={100} height={12} borderRadius={4} />
        </View>
        <Skeleton width={16} height={16} borderRadius={4} />
      </View>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, flexDirection: "row", alignItems: "center", paddingVertical: 14 }}>
        {[["20", "36", "32"], ["20", "36", "44"], ["20", "56", "40"]].map(([iconH, valW, labelW], i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={{ width: 1, height: 40, backgroundColor: colors.border }} />}
            <View style={{ flex: 1, alignItems: "center", gap: 5 }}>
              <Skeleton width={Number(iconH)} height={Number(iconH)} borderRadius={5} />
              <Skeleton width={Number(valW)} height={14} borderRadius={4} />
              <Skeleton width={Number(labelW)} height={11} borderRadius={4} />
            </View>
          </React.Fragment>
        ))}
      </View>
      <Skeleton width="100%" height={34} borderRadius={12} />
      <Skeleton width="100%" height={34} borderRadius={12} />
      <Skeleton width="100%" height={56} borderRadius={14} />
      {[140, 110, 130, 120, 150].map((labelW, i) => (
        <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          <Skeleton width={36} height={36} borderRadius={10} />
          <Skeleton width={labelW} height={14} borderRadius={4} />
          <View style={{ flex: 1 }} />
          <Skeleton width={16} height={16} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export function VideoFeedSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: "#000", flexDirection: "column" }}>

      {/* ── Video area (fills remaining space) ── */}
      <View style={{ flex: 1, backgroundColor: "#000" }} />

      {/* ── Caption strip (56 px, matches CAPTION_H in VideoFeed) ── */}
      <View style={{
        height: 56,
        backgroundColor: "#000",
        paddingHorizontal: 14,
        paddingVertical: 10,
        justifyContent: "center",
        gap: 6,
        borderTopWidth: 0.5,
        borderTopColor: "rgba(255,255,255,0.06)",
      }}>
        <Skeleton width="72%" height={13} forceDark />
        <Skeleton width="50%" height={11} forceDark />
      </View>

      {/* ── Bottom action bar (72 px, matches BOTTOM_BAR_H in VideoFeed) ── */}
      <View style={{
        height: 72,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#000",
        gap: 10,
        borderTopWidth: 0.5,
        borderTopColor: "rgba(255,255,255,0.08)",
      }}>

        {/* Left: avatar ring + stacked (handle | slim follow pill) */}
        <View style={{ borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)", borderRadius: 20, padding: 1 }}>
          <Skeleton width={34} height={34} borderRadius={17} forceDark />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Skeleton width={90} height={13} forceDark />
          <Skeleton width={56} height={18} borderRadius={99} forceDark />
        </View>

        {/* Right: 4 equal icons — heart+label, comment+label, bookmark, share */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
          {/* heart (with count) */}
          <View style={{ alignItems: "center", gap: 3 }}>
            <Skeleton width={24} height={24} borderRadius={12} forceDark />
            <Skeleton width={22} height={10} forceDark />
          </View>
          {/* comment (with count) */}
          <View style={{ alignItems: "center", gap: 3 }}>
            <Skeleton width={24} height={24} borderRadius={12} forceDark />
            <Skeleton width={18} height={10} forceDark />
          </View>
          {/* bookmark (no count) */}
          <Skeleton width={24} height={24} borderRadius={12} forceDark />
          {/* share (no count) */}
          <Skeleton width={24} height={24} borderRadius={12} forceDark />
        </View>

      </View>
    </View>
  );
}

export function ShortsFeedSkeleton({ dark = true }: { dark?: boolean }) {
  const { colors } = useTheme();
  const bg = dark ? "#000" : colors.background;
  return (
    <View style={{ flex: 1, backgroundColor: bg, flexDirection: "column" }}>

      {/* ── Video area ── */}
      <View style={{ flex: 1, backgroundColor: bg }} />

      {/* ── Caption strip (56 px) ── */}
      <View style={{
        height: 56,
        backgroundColor: bg,
        paddingHorizontal: 14,
        paddingVertical: 10,
        justifyContent: "center",
        gap: 6,
        borderTopWidth: 0.5,
        borderTopColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      }}>
        <Skeleton width="72%" height={13} forceDark={dark} />
        <Skeleton width="50%" height={11} forceDark={dark} />
      </View>

      {/* ── Bottom action bar (72 px) ── */}
      <View style={{
        height: 72,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: dark ? "#000" : colors.card,
        gap: 10,
        borderTopWidth: 0.5,
        borderTopColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      }}>

        {/* Left: avatar + handle + slim follow pill */}
        <View style={{ borderWidth: 1.5, borderColor: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)", borderRadius: 20, padding: 1 }}>
          <Skeleton width={34} height={34} borderRadius={17} forceDark={dark} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Skeleton width={90} height={13} forceDark={dark} />
          <Skeleton width={56} height={18} borderRadius={99} forceDark={dark} />
        </View>

        {/* Right: heart+label · comment+label · bookmark · share */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
          <View style={{ alignItems: "center", gap: 3 }}>
            <Skeleton width={24} height={24} borderRadius={12} forceDark={dark} />
            <Skeleton width={22} height={10} forceDark={dark} />
          </View>
          <View style={{ alignItems: "center", gap: 3 }}>
            <Skeleton width={24} height={24} borderRadius={12} forceDark={dark} />
            <Skeleton width={18} height={10} forceDark={dark} />
          </View>
          <Skeleton width={24} height={24} borderRadius={12} forceDark={dark} />
          <Skeleton width={24} height={24} borderRadius={12} forceDark={dark} />
        </View>

      </View>
    </View>
  );
}

export function AiRedirectSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 18, backgroundColor: colors.background }}>
      <Skeleton width={72} height={72} borderRadius={20} />
      <Skeleton width={160} height={16} />
      <Skeleton width={100} height={12} />
    </View>
  );
}

export function ReplyListSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 0, backgroundColor: colors.background }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          <Skeleton width={34} height={34} borderRadius={17} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton width={110} height={13} borderRadius={5} />
            <Skeleton width="90%" height={13} borderRadius={5} />
            <Skeleton width="70%" height={13} borderRadius={5} />
            <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
              <Skeleton width={40} height={11} borderRadius={4} />
              <Skeleton width={40} height={11} borderRadius={4} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  postCard: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  postActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
  },
  profile: {
    alignItems: "center",
    paddingVertical: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
    marginTop: 16,
  },
  giftCard: {
    width: "30%",
    margin: 4,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  gameCard: {
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 4,
  },
  marketCard: {
    width: "47%",
    margin: "1.5%",
    borderRadius: 14,
    overflow: "hidden",
  },
});
