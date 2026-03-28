import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

const COLORS = [
  "#FF6B6B", "#FF8E53", "#FFC107", "#56CCF2",
  "#34A853", "#6C63FF", "#AF52DE", "#34C759",
];

function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
  premium?: boolean;
};

export function ThreeDAvatar({ uri, name, size = 48, premium = false }: Props) {
  const color = nameColor(name || "U");
  const r = size / 2;

  return (
    <View style={[styles.root, { width: size, height: size, borderRadius: r }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.photo, { width: size, height: size, borderRadius: r }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: r, backgroundColor: color }]}>
          <Text style={[styles.initial, { fontSize: size * 0.35 }]}>{initials(name || "U")}</Text>
        </View>
      )}

      <View
        style={[
          styles.glassOverlay,
          {
            width: size,
            height: size,
            borderRadius: r,
          },
        ]}
      />

      <View
        style={[
          styles.highlightDot,
          {
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size * 0.11,
            top: size * 0.12,
            left: size * 0.18,
          },
        ]}
      />

      {premium && (
        <View style={[styles.premiumRing, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    position: "absolute",
  },
  fallback: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
  },
  glassOverlay: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  highlightDot: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  premiumRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#D4A853",
    top: -2,
    left: -2,
  },
});
