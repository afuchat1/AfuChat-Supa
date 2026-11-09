import React, { useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { AfuLogo } from "@/components/ui/AfuLogo";
import { DonateSheet } from "@/components/DonateSheet";
import Colors from "@/constants/colors";
import Constants from "expo-constants";
import { openAppReview } from "@/lib/appReview";
import { useLanguage } from "@/context/LanguageContext";

const VERSION = Constants.expoConfig?.version ?? "2.2.5";
const BUILD   = (Constants.expoConfig?.android as any)?.versionCode
  ? String((Constants.expoConfig?.android as any).versionCode)
  : "232";

const ACCENT = Colors.brand;

// ─── Feature cards ────────────────────────────────────────────────────────────
// Reflects the actual screens and capabilities in the app.

const FEATURES = [
  {
    icon: "chatbubbles",
    label: "about.feature_messaging",
    desc: "about.feature_messaging_desc",
  },
  {
    icon: "call",
    label: "about.feature_voice_calls",
    desc: "about.feature_voice_calls_desc",
  },
  {
    icon: "play-circle",
    label: "about.feature_video_feed",
    desc: "about.feature_video_feed_desc",
  },
  {
    icon: "information-circle-outline",
    label: "about.feature_afuai",
    desc: "about.feature_afuai_desc",
  },
  {
    icon: "wallet",
    label: "about.feature_acoin_wallet",
    desc: "about.feature_acoin_wallet_desc",
  },
  {
    icon: "storefront",
    label: "about.feature_marketplace",
    desc: "about.feature_marketplace_desc",
  },
  {
    icon: "trophy",
    label: "about.feature_prestige",
    desc: "about.feature_prestige_desc",
  },
  {
    icon: "grid",
    label: "about.feature_super_app",
    desc: "about.feature_super_app_desc",
  },
] as const;

// ─── Stats ────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "2M+",  label: "about.stats_users"       },
  { value: "190+", label: "about.stats_countries"   },
  { value: "50M+", label: "about.stats_messages_day" },
] as const;

// ─── Links ────────────────────────────────────────────────────────────────────

const LINKS = [
  { icon: "document-text",   label: "about.terms",  onPress: () => Linking.openURL("https://afuchat.com/terms").catch(() => {}) },
  { icon: "shield-checkmark",label: "about.privacy",    onPress: () => Linking.openURL("https://afuchat.com/privacy").catch(() => {}) },
  { icon: "help-buoy",       label: "about.help_support",    onPress: () => router.push("/support" as any) },
  { icon: "star",            label: "about.rate_on_google_play", onPress: () => openAppReview().catch(() => {}) },
  { icon: "globe",           label: "about.visit_website", onPress: () => Linking.openURL("https://afuchat.com").catch(() => {}) },
  { icon: "mail",            label: "about.contact_us",        onPress: () => Linking.openURL("mailto:hello@afuchat.com").catch(() => {}) },
] as const;

const GITHUB_URL = "https://github.com/afuchat1/AfuChat-Supa";

// ─────────────────────────────────────────────────────────────────────────────

export default function AboutScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [donateOpen, setDonateOpen] = useState(false);

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title={t("about.title")}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/settings" as any))}
      />

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <View style={[s.heroCard, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={isDark
              ? ["rgba(31,149,255,0.12)", "transparent"]
              : ["rgba(31,149,255,0.07)", "transparent"]}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <AfuLogo size={88} />

          <View style={s.wordmark}>
            <Text style={[s.wordAfu,  { color: colors.text }]}>Afu</Text>
            <Text style={[s.wordChat, { color: ACCENT }]}>Chat</Text>
          </View>

          <View style={[s.versionBadge, { backgroundColor: ACCENT + "18", borderColor: ACCENT + "40" }]}>
            <Text style={[s.versionText, { color: ACCENT }]}>
              v{VERSION}  ·  Build {BUILD}
            </Text>
          </View>

          <Text style={[s.tagline, { color: colors.textMuted }]}>
            {t("about.tagline")}
          </Text>

          <Text style={[s.missionText, { color: colors.textSecondary }]}>
            {t("about.mission")}
          </Text>
        </View>

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        <View style={s.statsRow}>
          {STATS.map(({ value, label }) => (
            <View key={label} style={[s.statBox, { backgroundColor: colors.card }]}>
              <Text style={[s.statValue, { color: ACCENT }]}>{value}</Text>
              <Text style={[s.statLabel, { color: colors.textMuted }]}>{t(label)}</Text>
            </View>
          ))}
        </View>

        {/* ── Features ──────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("about.features_section")}</Text>
        <View style={s.featuresGrid}>
          {FEATURES.map(({ icon, label, desc }) => (
            <View key={label} style={[s.featureCard, { backgroundColor: colors.card }]}>
              <View style={[s.featureIconBox, { backgroundColor: ACCENT + "15" }]}>
                <Ionicons name={icon as any} size={22} color={ACCENT} />
              </View>
              <Text style={[s.featureLabel, { color: colors.text }]}>{t(label)}</Text>
              <Text style={[s.featureDesc,  { color: colors.textMuted }]}>{t(desc)}</Text>
            </View>
          ))}
        </View>

        {/* ── Company ───────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("about.company_section")}</Text>
        <View style={[s.companyCard, { backgroundColor: colors.card }]}>
          {[
            { label: "about.legal_name",   value: "AfuChat Technologies Limited" },
            { label: "about.founded",      value: "2023" },
            { label: "about.headquarters", value: "Entebbe, Uganda" },
            { label: "about.website",      value: "afuchat.com" },
          ].map(({ label, value }, i, arr) => (
            <React.Fragment key={label}>
              <View style={s.companyRow}>
                <Text style={[s.companyLabel, { color: colors.textMuted }]}>{t(label)}</Text>
                <Text style={[s.companyValue, { color: colors.text }]}>{value}</Text>
              </View>
              {i < arr.length - 1 && (
                <View style={[s.companyDivider, { backgroundColor: colors.separator }]} />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* ── Support & GitHub ──────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("about.support_project_section")}</Text>

        {/* Donate CTA */}
        <TouchableOpacity
          style={[s.donateCard, { backgroundColor: "#FF3B3010", borderColor: "#FF3B3030" }]}
          onPress={() => setDonateOpen(true)}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={["rgba(255,59,48,0.08)", "transparent"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[s.donateIconBox, { backgroundColor: "#FF3B3020" }]}>
            <Ionicons name="heart" size={22} color="#FF3B30" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.donateTitle, { color: colors.text }]}>{t("about.donate")}</Text>
            <Text style={[s.donateSub, { color: colors.textMuted }]}>
              {t("about.donate_description")}
            </Text>
          </View>
          <View style={s.donateBadge}>
            <Text style={s.donateBadgeText}>{t("about.give")}</Text>
          </View>
        </TouchableOpacity>

        {/* GitHub */}
        <TouchableOpacity
          style={[s.githubCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => Linking.openURL(GITHUB_URL).catch(() => {})}
          activeOpacity={0.82}
        >
          <View style={[s.githubIconBox, { backgroundColor: isDark ? "#ffffff14" : "#00000010" }]}>
            {/* GitHub mark rendered with Ionicons logo-github */}
            <Ionicons name="logo-github" size={22} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.githubTitle, { color: colors.text }]}>GitHub</Text>
            <Text style={[s.githubSub, { color: colors.textMuted }]}>
              {t("about.github_description")}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ── Links ─────────────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: colors.textMuted }]}>{t("about.legal_support_section")}</Text>
        <View style={[s.linksCard, { backgroundColor: colors.card }]}>
          {LINKS.map(({ icon, label, onPress }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={[s.linkDivider, { backgroundColor: colors.separator }]} />}
              <TouchableOpacity style={s.linkRow} onPress={onPress} activeOpacity={0.7}>
                <View style={[s.linkIconBox, { backgroundColor: ACCENT + "15" }]}>
                  <Ionicons name={icon as any} size={18} color={ACCENT} />
                </View>
                <Text style={[s.linkLabel, { color: colors.text }]}>{t(label)}</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.footerLogo}>
            <AfuLogo size={20} />
            <Text style={[s.wordAfu,  { color: colors.textMuted, fontSize: 14 }]}>Afu</Text>
            <Text style={[s.wordChat, { color: ACCENT, fontSize: 14 }]}>Chat</Text>
          </View>
          <Text style={[s.copyright, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} AfuChat Technologies Limited
          </Text>
          <Text style={[s.copyright, { color: colors.textMuted }]}>
             {t("about.footer")}
          </Text>
        </View>

      </ScrollView>

      <DonateSheet visible={donateOpen} onClose={() => setDonateOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },

  heroCard: {
    borderRadius: 24, alignItems: "center", padding: 28, gap: 8,
    marginBottom: 8, overflow: "hidden",
  },
  wordmark: { flexDirection: "row", alignItems: "baseline" },
  wordAfu:  { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  wordChat: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  versionBadge: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
  versionText:  { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  tagline:     { fontSize: 14, fontFamily: "Inter_400Regular", letterSpacing: 1 },
  missionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, textAlign: "center", marginTop: 4, maxWidth: 300 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statBox:  { flex: 1, borderRadius: 16, alignItems: "center", paddingVertical: 16, gap: 2 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },

  sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginTop: 8, marginBottom: 6, paddingHorizontal: 4 },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  featureCard:  { borderRadius: 16, padding: 14, gap: 6, width: "48.5%" },
  featureIconBox: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  featureLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  featureDesc:  { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },

  companyCard:    { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  companyRow:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13 },
  companyLabel:   { fontSize: 13, fontFamily: "Inter_400Regular" },
  companyValue:   { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flex: 1, marginLeft: 8 },
  companyDivider: { height: 0.5, marginHorizontal: 16 },

  linksCard:   { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
  linkRow:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  linkDivider: { height: 0.5, marginHorizontal: 16 },
  linkIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  linkLabel:   { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },

  // Donate card
  donateCard:    { flexDirection: "row", alignItems: "center", borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 14, overflow: "hidden", marginBottom: 0 },
  donateIconBox: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  donateTitle:   { fontSize: 15, fontFamily: "Inter_700Bold" },
  donateSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  donateBadge:   { backgroundColor: "#FF3B30", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  donateBadgeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },

  // GitHub card
  githubCard:    { flexDirection: "row", alignItems: "center", borderRadius: 18, borderWidth: 1, padding: 16, gap: 14, marginBottom: 8 },
  githubIconBox: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  githubTitle:   { fontSize: 15, fontFamily: "Inter_700Bold" },
  githubSub:     { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  footer:     { alignItems: "center", paddingVertical: 24, gap: 6 },
  footerLogo: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  copyright:  { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
