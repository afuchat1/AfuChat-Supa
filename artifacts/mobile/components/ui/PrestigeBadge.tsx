import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getPrestigeTier } from "@/lib/prestige";

type Props = {
  acoin: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

export function PrestigeBadge({ acoin, size = "sm", showLabel = false }: Props) {
  const tier = getPrestigeTier(acoin);

  const dim = size === "lg" ? 28 : size === "md" ? 20 : 14;
  const fontSize = size === "lg" ? 18 : size === "md" ? 13 : 9;
  const labelSize = size === "lg" ? 13 : size === "md" ? 11 : 9;

  return (
    <View style={[styles.root, { borderColor: tier.color + "55", borderWidth: 1, borderRadius: (dim + 6) / 2, paddingHorizontal: showLabel ? 8 : 3, paddingVertical: 2 }]}>
      <Text style={{ fontSize, lineHeight: dim - 2 }}>{tier.emoji}</Text>
      {showLabel && (
        <Text style={[styles.label, { color: tier.color, fontSize: labelSize }]}>
          {tier.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  label: { fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
});
