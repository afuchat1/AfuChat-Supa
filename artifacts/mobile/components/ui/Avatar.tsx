import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { useAppAccent } from "@/context/AppAccentContext";
import { PremiumRing } from "./PremiumRing";

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: ViewStyle;
  online?: boolean;
  premium?: boolean;
  square?: boolean;
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashColor(name?: string): string {
  const colors = [
    "#FF6B6B","#00BCD4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD",
    "#98D8C8","#F7DC6F","#BB8FCE","#85C1E9","#82E0AA","#F0B27A",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ uri, name, size = 44, style, online, premium, square }: Props) {
  const { accent } = useAppAccent();
  const initials = getInitials(name);
  const bgColor = hashColor(name);
  const radius = square ? size * 0.2 : size / 2;

  const innerNode = (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: radius, backgroundColor: bgColor },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
        </View>
      )}
      {online && (
        <View
          style={[
            styles.onlineDot,
            {
              backgroundColor: accent,
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );

  const ring = 2.5;
  const gap = 2;
  const outerSize = size + (ring + gap) * 2;

  if (premium) {
    return (
      <View style={[{ width: outerSize, height: outerSize }, style]}>
        <PremiumRing size={size}>
          {innerNode}
        </PremiumRing>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size }, style]}>
      {innerNode}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
  },
  onlineDot: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});
