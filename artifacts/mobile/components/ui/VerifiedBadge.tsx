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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppAccent } from "@/context/AppAccentContext";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";

let _svgMod: any = null;
function getSvgMod() {
  if (_svgMod !== null) return _svgMod;
  try { _svgMod = require("react-native-svg"); } catch { _svgMod = {}; }
  return _svgMod;
}
function SvgComp(name: string) {
  return (props: any) => {
    const M = getSvgMod();
    const C = M[name] ?? M.default?.[name];
    if (!C) return null;
    return require("react").createElement(C, props);
  };
}
const Svg = (props: any) => {
  const M = getSvgMod();
  const C = M.default ?? M.Svg;
  if (!C) return null;
  return require("react").createElement(C, props);
};
const Circle = SvgComp("Circle");
const Path = SvgComp("Path");

function BadgeShape({ size, color }: { size: number; color: string }) {
  const M = getSvgMod();
  const hasSvg = !!(M.default ?? M.Svg);
  if (!hasSvg) {
    return (
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ color: "#fff", fontSize: size * 0.55, fontWeight: "700" }}>✓</Text>
      </View>
    );
  }
  const r = size / 2;
  const sw = size * 0.13;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx="10" cy="10" r="9.2" fill={color} />
      <Path
        d="M5.8,10.2 L8.6,13 L14.2,7"
        stroke="#fff"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

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
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);

  const isOrg   = !!isOrganizationVerified;
  const isVerif = !!isVerified || isOrg;

  if (!isVerif) return null;

  const badgeColor = isOrg ? "#F5A623" : accent;

  const REASONS: { icon: string; label: string }[] = isOrg
    ? [
        { icon: "storefront-outline",      label: "verified.business_confirmed" },
        { icon: "ribbon-outline",           label: "verified.recognized_field" },
        { icon: "shield-checkmark-outline", label: "verified.follows_guidelines" },
      ]
    : [
        { icon: "person-outline",          label: "verified.identity_confirmed" },
        { icon: "ribbon-outline",           label: "verified.public_presence" },
        { icon: "shield-checkmark-outline", label: "verified.follows_guidelines" },
      ];

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
        hitSlop={10}
        style={{ marginLeft: 2 }}
      >
        <BadgeShape size={size} color={badgeColor} />
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
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            <View style={s.header}>
              <View style={[s.iconWrap, { backgroundColor: badgeColor + "18" }]}>
                <BadgeShape size={32} color={badgeColor} />
              </View>
              <View style={s.headerCopy}>
                <Text style={[s.title, { color: colors.text }]}>
                  {t(isOrg ? "verified.organization" : "verified.account")}
                </Text>
                <Text style={[s.subtitle, { color: colors.textSecondary }]}>
                  {t(isOrg ? "verified.organization_subtitle" : "verified.account_subtitle")}
                </Text>
              </View>
            </View>

            <View style={[s.divider, { backgroundColor: colors.border }]} />

            <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
              {t("verified.why_badge")}
            </Text>

            {REASONS.map((r, i) => (
              <View key={i} style={s.bulletRow}>
                <View style={[s.bulletIcon, { backgroundColor: badgeColor + "18" }]}>
                  <Ionicons name={r.icon as any} size={15} color={badgeColor} />
                </View>
                <Text style={[s.bulletText, { color: colors.textSecondary }]}>{t(r.label)}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={[s.ctaBtn, { backgroundColor: badgeColor }]}
              activeOpacity={0.85}
              onPress={() => {
                setVisible(false);
                router.push(isOrg ? "/business-verification" : "/premium");
              }}
            >
              <Ionicons name={isOrg ? "storefront-outline" : "ribbon-outline"} size={15} color="#fff" />
              <Text style={s.ctaBtnText}>{t(isOrg ? "verified.apply" : "verified.get")}</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 26,
    paddingTop: 8,
    paddingBottom: 9,
    paddingHorizontal: 14,
    ...Platform.select({
      web: { boxShadow: "0 -4px 16px rgba(0,0,0,0.12)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
    }),
  },
  handle: { width: 26, height: 3, borderRadius: 2, alignSelf: "center", marginBottom: 9 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconWrap: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 12, lineHeight: 16 },
  divider: { height: 0.5, marginVertical: 9 },
  sectionLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, marginBottom: 7 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 6 },
  bulletIcon: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bulletText: { flex: 1, fontSize: 12, lineHeight: 16 },
  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 9, borderRadius: 11, marginTop: 4 },
  ctaBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
