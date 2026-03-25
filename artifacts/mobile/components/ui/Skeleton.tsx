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
});
