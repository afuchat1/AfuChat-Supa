import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";

// ─── Badge shape paths (20×20 viewBox) ───────────────────────────────────────
//
// 12-pointed star/seal — the classic modern verification badge shape used by
// Twitter, Telegram Premium, and Meta. NOT a circle/ring.
//
// Outer radius 9.2, inner radius 5.5, 24 alternating points (12 outer + 12 inner).
const SEAL_PATH =
  "M10,0.8 L11.42,4.69 L14.6,2.03 L13.89,6.11 L17.97,5.4 L15.31,8.58 " +
  "L19.2,10 L15.31,11.42 L17.97,14.6 L13.89,13.89 L14.6,17.97 L11.42,15.31 " +
  "L10,19.2 L8.58,15.31 L5.4,17.97 L6.11,13.89 L2.03,14.6 L4.69,11.42 " +
  "L0.8,10 L4.69,8.58 L2.03,5.4 L6.11,6.11 L5.4,2.03 L8.58,4.69 Z";

// White checkmark centred within the seal (fits the ~5.5-unit inner circle).
const CHECK_PATH = "M5.8,10.4 L8.6,13.3 L14.2,7.2";

// ─── Organisation variant: shield shape ──────────────────────────────────────
//
// A pentagon shield — immediately reads as "official/org" rather than personal.
const SHIELD_PATH =
  "M10,1 L18.5,4.8 L18.5,11 C18.5,15.5 14.5,18.5 10,19.5 " +
  "C5.5,18.5 1.5,15.5 1.5,11 L1.5,4.8 Z";

type BadgeProps = { size: number; color: string; isOrg?: boolean };

function BadgeShape({ size, color, isOrg = false }: BadgeProps) {
  const checkStroke = size * 0.115;       // scales cleanly from 12px to 40px
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path d={isOrg ? SHIELD_PATH : SEAL_PATH} fill={color} />
      <Path
        d={CHECK_PATH}
        stroke="#fff"
        strokeWidth={checkStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  isVerified?: boolean;
  isOrganizationVerified?: boolean;
  size?: number;
};

export default function VerifiedBadge({
  isVerified,
  isOrganizationVerified,
  size = 14,
}: Props) {
  const { accent } = useAppAccent();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  const isOrg   = !!isOrganizationVerified;
  const isVerif = !!isVerified || isOrg;

  if (!isVerif) return null;

  const badgeColor = isOrg ? "#D4A853" : accent;

  const REASONS: { icon: string; label: string; premiumLink?: boolean }[] = isOrg
    ? [
        { icon: "business-outline",       label: "Confirmed authentic business, brand, or organization" },
        { icon: "shield-checkmark-outline", label: "Notable presence in its industry or community", premiumLink: true },
        { icon: "document-text-outline",  label: "Compliant with AfuChat's community guidelines" },
      ]
    : [
        { icon: "person-circle-outline",  label: "Confirmed authentic identity as a real person" },
        { icon: "star-outline",           label: "Notable creator, public figure, or professional", premiumLink: true },
        { icon: "checkmark-done-outline", label: "Compliant with AfuChat's community guidelines" },
      ];

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        hitSlop={10}
        style={{ marginLeft: 2 }}
      >
        <BadgeShape size={size} color={badgeColor} isOrg={isOrg} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setVisible(false)} />

        <View style={s.sheet}>
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            {/* Drag handle */}
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            {/* Badge + title */}
            <View style={s.header}>
              <View style={[s.iconWrap, { backgroundColor: badgeColor + "18" }]}>
                <BadgeShape size={44} color={badgeColor} isOrg={isOrg} />
              </View>
              <Text style={[s.title, { color: colors.text }]}>
                {isOrg ? "Verified Organization" : "Verified Account"}
              </Text>
              <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                {isOrg
                  ? "AfuChat has confirmed this is an authentic business, brand, or organization."
                  : "AfuChat has confirmed this is an authentic account of a notable person or creator."}
              </Text>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
              VERIFICATION CRITERIA
            </Text>

            {REASONS.map((r, i) =>
              r.premiumLink ? (
                <TouchableOpacity
                  key={i}
                  style={[s.bulletRow, s.bulletRowTappable, { borderColor: badgeColor + "30", backgroundColor: badgeColor + "0C" }]}
                  activeOpacity={0.75}
                  onPress={() => { setVisible(false); router.push("/premium"); }}
                >
                  <View style={[s.bulletIcon, { backgroundColor: badgeColor + "28" }]}>
                    <Ionicons name={r.icon as any} size={15} color={badgeColor} />
                  </View>
                  <Text style={[s.bulletText, { color: colors.textSecondary, flex: 1 }]}>{r.label}</Text>
                  <View style={[s.premiumPill, { backgroundColor: badgeColor + "22" }]}>
                    <Ionicons name="diamond-outline" size={10} color={badgeColor} />
                    <Text style={[s.premiumPillText, { color: badgeColor }]}>Premium</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <View key={i} style={s.bulletRow}>
                  <View style={[s.bulletIcon, { backgroundColor: badgeColor + "18" }]}>
                    <Ionicons name={r.icon as any} size={15} color={badgeColor} />
                  </View>
                  <Text style={[s.bulletText, { color: colors.textSecondary }]}>{r.label}</Text>
                </View>
              )
            )}

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: badgeColor }]}
              activeOpacity={0.85}
              onPress={() => {
                setVisible(false);
                router.push(isOrg ? "/business-verification" : "/premium");
              }}
            >
              <Ionicons name={isOrg ? "business-outline" : "ribbon-outline"} size={16} color="#fff" />
              <Text style={s.ctaBtnText}>{isOrg ? "Apply for Verification" : "Get Verified"}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.6}
            >
              <Text style={[s.dismissText, { color: colors.textMuted }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  header: {
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  bulletRowTappable: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginHorizontal: -4,
  },
  bulletIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  premiumPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  ctaBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  dismissBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  dismissText: {
    fontSize: 14,
  },
});
