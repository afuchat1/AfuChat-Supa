/**
 * CompressionPreview — shows estimated before/after video size before upload.
 *
 * Two variants:
 *   <CompressionBadge />  — compact pill for the edit-phase overlay badges
 *   <CompressionCard  />  — full card for the Step 2 "details / post" panel
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CompressionEstimate } from "@/lib/videoCompression";

const ND = true;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function useFadeSlideIn(delay = 0) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1, duration: 260, useNativeDriver: ND,
        }),
        Animated.spring(translateY, {
          toValue: 0, tension: 200, friction: 20, useNativeDriver: ND,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return { opacity, translateY };
}

// ─── Compact badge (edit phase) ───────────────────────────────────────────────

interface BadgeProps {
  est: CompressionEstimate;
}

export function CompressionBadge({ est }: BadgeProps) {
  const { opacity, translateY } = useFadeSlideIn(80);

  return (
    <Animated.View
      style={[bs.pill, { opacity, transform: [{ translateY }] }]}
    >
      <Ionicons name="flash" size={10} color="#FACC15" />
      <Text style={bs.before}>{est.originalLabel}</Text>
      <Ionicons name="arrow-forward" size={10} color="#666" />
      <Text style={bs.after}>{est.estimatedLabel}</Text>
      <View style={bs.savingsPill}>
        <Text style={bs.savingsText}>-{est.savingsPct}%</Text>
      </View>
    </Animated.View>
  );
}

const bs = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: "rgba(250,204,21,0.3)",
  },
  before: {
    color: "#999",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  after: {
    color: "#4ADE80",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  savingsPill: {
    backgroundColor: "rgba(74,222,128,0.18)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  savingsText: {
    color: "#4ADE80",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
});

// ─── Full card (step 2 details) ───────────────────────────────────────────────

interface CardProps {
  est: CompressionEstimate;
  style?: any;
}

export function CompressionCard({ est, style }: CardProps) {
  const { opacity, translateY } = useFadeSlideIn(60);

  // Animate the compressed bar width from 0 → savingsRatio
  const barAnim = useRef(new Animated.Value(0)).current;
  const compressedRatio = est.estimatedBytes / Math.max(est.originalBytes, 1);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.spring(barAnim, {
        toValue: 1,
        tension: 120,
        friction: 16,
        useNativeDriver: false, // width % can't use native driver
      }).start();
    }, 220); // slight delay so card fades in first
    return () => clearTimeout(t);
  }, []);

  const compressedBarWidth = barAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0%", `${Math.round(compressedRatio * 100)}%`],
  });

  return (
    <Animated.View
      style={[cs.card, style, { opacity, transform: [{ translateY }] }]}
    >
      {/* ── Header ── */}
      <View style={cs.header}>
        <View style={cs.flashWrap}>
          <Ionicons name="flash" size={13} color="#FACC15" />
        </View>
        <Text style={cs.headerTitle}>Smart Compression</Text>
        <View style={cs.networkBadge}>
          <Ionicons
            name={est.networkLabel === "Wi-Fi" ? "wifi" : "cellular"}
            size={10}
            color="#888"
          />
          <Text style={cs.networkText}>{est.networkLabel}</Text>
        </View>
      </View>

      {/* ── Before / After row ── */}
      <View style={cs.sizesRow}>
        {/* Original */}
        <View style={cs.sizeGroup}>
          <Text style={cs.sizeCaption}>Original</Text>
          <Text style={cs.sizeValueGray}>{est.originalLabel}</Text>
        </View>

        {/* Arrow */}
        <View style={cs.arrowGroup}>
          <View style={cs.arrowLine} />
          <View style={cs.arrowCircle}>
            <Ionicons name="arrow-forward" size={12} color="#fff" />
          </View>
          <View style={cs.arrowLine} />
        </View>

        {/* Estimated */}
        <View style={[cs.sizeGroup, cs.sizeGroupRight]}>
          <Text style={cs.sizeCaption}>Compressed</Text>
          <Text style={cs.sizeValueGreen}>{est.estimatedLabel}</Text>
        </View>

        {/* Savings bubble */}
        <View style={cs.savingsBubble}>
          <Text style={cs.savingsBubbleText}>-{est.savingsPct}%</Text>
          <Text style={cs.savingsBubbleSub}>smaller</Text>
        </View>
      </View>

      {/* ── Before/after bars ── */}
      <View style={cs.barsSection}>
        {/* Original bar — full width */}
        <View style={cs.barRow}>
          <View style={cs.barLabelCol}>
            <Text style={cs.barCaption}>Before</Text>
          </View>
          <View style={cs.barTrack}>
            <View style={[cs.bar, cs.barOriginal]} />
          </View>
          <Text style={cs.barSize}>{est.originalLabel}</Text>
        </View>

        {/* Compressed bar — animated to ratio width */}
        <View style={cs.barRow}>
          <View style={cs.barLabelCol}>
            <Text style={cs.barCaption}>After</Text>
          </View>
          <View style={cs.barTrack}>
            <Animated.View style={[cs.bar, cs.barCompressed, { width: compressedBarWidth }]} />
          </View>
          <Text style={[cs.barSize, { color: "#4ADE80" }]}>{est.estimatedLabel}</Text>
        </View>
      </View>

      {/* ── Footer ── */}
      <View style={cs.footer}>
        <Ionicons name="cloud-upload" size={12} color="#555" />
        <Text style={cs.footerText}>
          Upload time on {est.networkLabel}: <Text style={{ color: "#aaa" }}>{est.uploadTimeLabel}</Text>
        </Text>
      </View>
    </Animated.View>
  );
}

const cs = StyleSheet.create({
  card: {
    backgroundColor: "#111",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(250,204,21,0.18)",
    padding: 14,
    gap: 12,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  flashWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(250,204,21,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#1E1E1E",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  networkText: {
    color: "#888",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },

  // Sizes row
  sizesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sizeGroup: {
    alignItems: "flex-start",
    gap: 2,
  },
  sizeGroupRight: {
    alignItems: "flex-start",
  },
  sizeCaption: {
    color: "#555",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sizeValueGray: {
    color: "#888",
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  sizeValueGreen: {
    color: "#4ADE80",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  arrowGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  arrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },
  arrowCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#3A3A3A",
    alignItems: "center",
    justifyContent: "center",
  },
  savingsBubble: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
  },
  savingsBubbleText: {
    color: "#4ADE80",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
  },
  savingsBubbleSub: {
    color: "#4ADE80",
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    opacity: 0.7,
  },

  // Bars
  barsSection: {
    gap: 6,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  barLabelCol: {
    width: 36,
  },
  barCaption: {
    color: "#555",
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: "#1E1E1E",
    borderRadius: 3,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 3,
  },
  barOriginal: {
    width: "100%",
    backgroundColor: "#3A3A3A",
  },
  barCompressed: {
    backgroundColor: "#4ADE80",
  },
  barSize: {
    color: "#777",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    minWidth: 52,
    textAlign: "right",
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: "#1E1E1E",
  },
  footerText: {
    color: "#555",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
