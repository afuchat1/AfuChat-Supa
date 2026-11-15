import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { CachedImage } from "./CachedImage";
import { useAppAccent } from "@/context/AppAccentContext";
import { PremiumRing } from "./PremiumRing";
import { useUserEffects } from "@/hooks/useUserEffects";

type PrestigeRing = 'crown' | 'void' | 'diamond';

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: ViewStyle;
  online?: boolean;
  premium?: boolean;
  square?: boolean;
  prestigeRing?: PrestigeRing | null;
  userId?: string | null;
};

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashColor(name?: string): string {
  const colors = [
    "#FF6B6B","#258FE5","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD",
    "#98D8C8","#F7DC6F","#BB8FCE","#85C1E9","#82E0AA","#F0B27A",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ uri, name, size = 44, style, online, premium, square, prestigeRing, userId }: Props) {
  const { accent } = useAppAccent();
  const effects = useUserEffects(userId);
  const initials = getInitials(name);
  const bgColor = hashColor(name);
  const radius = square ? size * 0.2 : size / 2;

  // Status effect rings take full priority — suppress premium ring when one is active
  const requestedRing: PrestigeRing | null =
    prestigeRing === "crown" && !effects.isPlatinum ? null : (prestigeRing ?? null);
  const resolvedRing: PrestigeRing | null = requestedRing
    ?? (effects.crownRing ? 'crown' : effects.voidRing ? 'void' : effects.diamondRing ? 'diamond' : null);

  // When userId is provided, effects are the sole source of truth for rings.
  // The premium prop is only honoured when no userId is known (e.g. anonymous/system avatars).
  const showRing = resolvedRing !== null || (!userId && !!premium);

  const innerNode = (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <CachedImage
          uri={uri}
          cacheType="avatar"
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
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

  if (showRing) {
    return (
      <View style={[{ width: outerSize, height: outerSize }, style]}>
        <PremiumRing size={size} square={square} ringType={resolvedRing ?? 'premium'}>
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
