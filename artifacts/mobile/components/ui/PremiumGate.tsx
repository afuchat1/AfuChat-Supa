import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useTier, TIER_COLORS, TIER_LABELS, type Tier } from "@/hooks/useTier";

type Props = {
  tier: Tier;
  title?: string;
  description?: string;
  children: React.ReactNode;
};

export function PremiumGate({ tier, title, description, children }: Props) {
  const { hasTier } = useTier();

  if (hasTier(tier)) return <>{children}</>;

  return <PremiumLockScreen tier={tier} title={title} description={description} />;
}

function PremiumLockScreen({ tier, title, description }: { tier: Tier; title?: string; description?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tierColor = TIER_COLORS[tier];
  const tierLabel = TIER_LABELS[tier];

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 12 }]}
        onPress={() => router.back()}
        hitSlop={{ top: 12, left: 12, right: 12, bottom: 12 }}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.body}>
        <View style={[styles.iconRing, { borderColor: tierColor + "44", backgroundColor: tierColor + "14" }]}>
          <Ionicons
            name={tier === "platinum" ? "diamond" : tier === "gold" ? "trophy" : "star"}
            size={44}
            color={tierColor}
          />
        </View>

        <View style={[styles.tierBadge, { backgroundColor: tierColor + "22", borderColor: tierColor + "55" }]}>
          <Text style={[styles.tierBadgeText, { color: tierColor }]}>{tierLabel} Required</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          {title ?? "Premium Feature"}
        </Text>

        <Text style={[styles.desc, { color: colors.textMuted }]}>
          {description ??
            `This feature is available for ${tierLabel} members and above. Upgrade to unlock it and everything else AfuChat Premium has to offer.`}
        </Text>

        <TouchableOpacity
          style={[styles.upgradeBtn, { backgroundColor: tierColor }]}
          onPress={() => router.push("/premium")}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up-circle" size={18} color="#fff" />
          <Text style={styles.upgradeBtnText}>Upgrade to {tierLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.textMuted }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backBtn: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  tierBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginTop: 4,
  },
  desc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  upgradeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  backLink: { marginTop: 4 },
  backLinkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
