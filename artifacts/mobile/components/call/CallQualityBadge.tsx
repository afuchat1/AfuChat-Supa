import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { CallQuality, CallQualityStats } from "@/lib/callSignaling";

type Props = {
  stats: CallQualityStats;
};

const LABELS: Record<CallQuality, string> = {
  connecting: "Connecting…",
  excellent: "Excellent",
  good: "Good",
  poor: "Poor",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

const COLORS: Record<CallQuality, string> = {
  connecting: "#FFB020",
  excellent: "#34C759",
  good: "#34C759",
  poor: "#FF9500",
  reconnecting: "#FF9500",
  disconnected: "#FF3B30",
};

const ACTIVE_BARS: Record<CallQuality, number> = {
  connecting: 1,
  excellent: 4,
  good: 3,
  poor: 2,
  reconnecting: 1,
  disconnected: 0,
};

/**
 * Compact pill that shows call quality. The signal bars + colour are derived
 * from the live `iceConnectionState` and `getStats()` measurements (RTT,
 * jitter, packet loss) sampled by `CallSession`.
 */
export function CallQualityBadge({ stats }: Props) {
  const { quality, rttMs, packetLoss } = stats;
  const color = COLORS[quality];
  const label = LABELS[quality];
  const active = ACTIVE_BARS[quality];

  // Build a tiny tooltip-style detail line for accuracy buffs.
  const details: string[] = [];
  if (rttMs != null && Number.isFinite(rttMs)) {
    details.push(`${Math.round(rttMs)}ms`);
  }
  if (packetLoss != null && Number.isFinite(packetLoss) && packetLoss > 0) {
    details.push(`${(packetLoss * 100).toFixed(1)}% loss`);
  }
  const detailLine = details.join(" • ");

  return (
    <View style={[styles.wrap, { borderColor: color + "55" }]}>
      <View style={styles.bars}>
        {[0, 1, 2, 3].map((i) => {
          const isActive = i < active;
          const heights = [6, 9, 12, 15];
          return (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  height: heights[i],
                  backgroundColor: isActive ? color : "rgba(255,255,255,0.2)",
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.label, { color }]}>{label}</Text>
        {detailLine ? (
          <Text style={styles.detail}>{detailLine}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "center",
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
  textCol: {
    flexDirection: "column",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14,
  },
  detail: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 12,
  },
});
