import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

type SkeletonProps = {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.border, opacity: anim },
        style,
      ]}
    />
  );
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
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Skeleton width={120} height={14} />
          <Skeleton width={60} height={10} style={{ marginTop: 6 }} />
        </View>
      </View>
      <Skeleton width="100%" height={14} style={{ marginTop: 12 }} />
      <Skeleton width="80%" height={14} style={{ marginTop: 6 }} />
      <Skeleton width="60%" height={14} style={{ marginTop: 6 }} />
      <View style={sk.postActions}>
        <Skeleton width={50} height={20} borderRadius={10} />
        <Skeleton width={50} height={20} borderRadius={10} />
        <Skeleton width={50} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={sk.profile}>
      <Skeleton width={80} height={80} borderRadius={40} />
      <Skeleton width={140} height={18} style={{ marginTop: 12 }} />
      <Skeleton width={100} height={14} style={{ marginTop: 6 }} />
      <View style={sk.statsRow}>
        <Skeleton width={60} height={40} borderRadius={8} />
        <Skeleton width={60} height={40} borderRadius={8} />
        <Skeleton width={60} height={40} borderRadius={8} />
      </View>
    </View>
  );
}

export function NotificationSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[sk.row, { borderBottomColor: colors.border }]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={sk.rowContent}>
        <Skeleton width={180} height={14} />
        <Skeleton width={100} height={12} style={{ marginTop: 6 }} />
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
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Skeleton width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1 }}>
          <Skeleton width={120} height={16} />
          <Skeleton width={80} height={12} style={{ marginTop: 4 }} />
        </View>
      </View>
      <Skeleton width="100%" height={16} style={{ marginTop: 8 }} />
      <Skeleton width="90%" height={16} />
      <Skeleton width="70%" height={16} />
      <Skeleton width="100%" height={200} borderRadius={12} style={{ marginTop: 8 }} />
      <Skeleton width={140} height={12} style={{ marginTop: 8 }} />
      <View style={{ flexDirection: "row", gap: 28, marginTop: 12 }}>
        <Skeleton width={50} height={20} borderRadius={10} />
        <Skeleton width={50} height={20} borderRadius={10} />
        <Skeleton width={50} height={20} borderRadius={10} />
      </View>
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

export function ReferralSkeleton() {
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Skeleton width="100%" height={140} borderRadius={20} />
      <Skeleton width="100%" height={100} borderRadius={14} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Skeleton width="48%" height={80} borderRadius={14} />
        <Skeleton width="48%" height={80} borderRadius={14} />
      </View>
      <Skeleton width="100%" height={140} borderRadius={14} />
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

export function ChatBubbleSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: align === "right" ? "flex-end" : "flex-start", paddingHorizontal: 12, marginVertical: 4 }}>
      {align === "left" && <Skeleton width={32} height={32} borderRadius={16} style={{ marginRight: 8 }} />}
      <View style={{ gap: 4 }}>
        <Skeleton width={Math.random() * 100 + 100} height={36} borderRadius={16} />
      </View>
    </View>
  );
}

export function ChatLoadingSkeleton() {
  return (
    <View style={{ flex: 1, padding: 8, justifyContent: "flex-end", gap: 6 }}>
      <ChatBubbleSkeleton align="left" />
      <ChatBubbleSkeleton align="right" />
      <ChatBubbleSkeleton align="left" />
      <ChatBubbleSkeleton align="right" />
      <ChatBubbleSkeleton align="left" />
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
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width={140} height={18} />
          <Skeleton width={90} height={13} />
          <Skeleton width={110} height={12} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Skeleton width="48%" height={72} borderRadius={14} />
        <Skeleton width="48%" height={72} borderRadius={14} />
      </View>
      <Skeleton width="100%" height={56} borderRadius={14} />
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
          <Skeleton width={36} height={36} borderRadius={10} />
          <Skeleton width={150} height={14} />
        </View>
      ))}
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

const sk = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
