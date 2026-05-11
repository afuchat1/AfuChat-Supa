import React, { useState } from "react";
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useTheme } from "@/hooks/useTheme";

const afuSymbol = require("@/assets/images/afu-symbol.png");

const APP_VERSION = Constants.expoConfig?.version ?? "2.0.30";
const BUILD = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode?.toString() ?? "2030";

const FEATURES = [
  { icon: "chatbubbles",      color: "#00BCD4", title: "Messaging",         desc: "End-to-end encrypted 1-on-1 and group chats, voice notes, stories, and broadcasts." },
  { icon: "sparkles",         color: "#AF52DE", title: "AfuAI",             desc: "Your built-in AI assistant — ask questions, generate content, and get smart suggestions." },
  { icon: "wallet",           color: "#D4A853", title: "ACoin Wallet",      desc: "Send, receive, and earn ACoins. Power all in-app transactions with your digital wallet." },
  { icon: "briefcase",        color: "#34C759", title: "Freelance Hub",     desc: "Hire talent or earn by offering your skills on AfuChat's built-in freelance marketplace." },
  { icon: "storefront",       color: "#5856D6", title: "Marketplace",       desc: "Shop from verified organization stores and discover exclusive products." },
  { icon: "calendar",         color: "#FF9500", title: "Digital Events",    desc: "Create, discover, and attend online or local events, sold with ACoin tickets." },
  { icon: "heart",            color: "#FF2D55", title: "AfuMatch",          desc: "Meet new people, make connections, and find meaningful relationships." },
  { icon: "gift",             color: "#FF3B30", title: "Gifts & Reactions", desc: "Send animated gifts and reactions to show appreciation in chats and live streams." },
  { icon: "game-controller",  color: "#007AFF", title: "Mini Games",        desc: "Play in-app games with friends and earn ACoins for winning." },
  { icon: "people",           color: "#32D74B", title: "Communities",       desc: "Join free or paid communities built around shared interests and goals." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is AfuChat?",
    a: "AfuChat is a super-app combining messaging, social networking, an AI assistant, a digital wallet, freelance marketplace, e-commerce, and community tools — all in one platform.",
  },
  {
    q: "What is ACoin?",
    a: "ACoin is AfuChat's in-app currency. You can earn ACoins through referrals, activities, and completing tasks, then spend them on services, gifts, events, and freelance jobs.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. AfuChat uses end-to-end encryption for private messages and follows industry-standard security practices to protect your personal data.",
  },
  {
    q: "How do I become a seller on Freelance Hub?",
    a: "Go to the Apps tab → Freelance Hub → Sell tab. Create a service listing with a title, description, price in ACoin, and delivery timeframe. Once published, buyers can order directly.",
  },
  {
    q: "How does the ACoin transfer work?",
    a: "When you purchase a service or send a gift, ACoin is transferred instantly from your wallet to the recipient's. Transactions are logged transparently on your wallet history.",
  },
  {
    q: "Can I withdraw ACoins to real money?",
    a: "ACoin withdrawal and conversion options depend on your region and account standing. Check the Wallet app or contact support for the latest payout options available to you.",
  },
  {
    q: "What is Premium membership?",
    a: "Premium unlocks advanced features like verified badges, higher storage, priority AI responses, exclusive communities, and special profile customizations.",
  },
  {
    q: "How do I report a user or content?",
    a: "Tap the three-dot menu on any profile, post, or message and select 'Report'. Our moderation team reviews reports within 24 hours.",
  },
  {
    q: "How do I contact support?",
    a: "Open the Me tab → Support Center, or email support@afuchat.com. We aim to respond within 24 hours on business days.",
  },
  {
    q: "How do I delete my account?",
    a: "Go to Me → Settings → Account → Delete Account. This is permanent — all your data, ACoins, and content will be removed. Export your data first if needed.",
  },
  {
    q: "Is AfuChat free?",
    a: "Yes — AfuChat is free to download and use. Premium subscriptions and in-app ACoin purchases are optional and unlock extra features.",
  },
  {
    q: "What platforms is AfuChat available on?",
    a: "AfuChat is available on iOS, Android, and web. Download from the App Store, Google Play, or access it via your browser.",
  },
];

function FaqItem({ item }: { item: { q: string; a: string } }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={[st.faqItem, { borderBottomColor: colors.border }]}
      onPress={() => setOpen(!open)}
      activeOpacity={0.75}
    >
      <View style={st.faqRow}>
        <Text style={[st.faqQ, { color: colors.text }]} numberOfLines={open ? undefined : 2}>{item.q}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </View>
      {open && (
        <Text style={[st.faqA, { color: colors.textSecondary }]}>{item.a}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Nav bar */}
      <View style={[st.nav, { backgroundColor: colors.surface, paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.navBack}>
          <Ionicons name="chevron-back" size={22} color={colors.accent} />
        </TouchableOpacity>
        <Text style={[st.navTitle, { color: colors.text }]}>About AfuChat</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* Hero */}
        <LinearGradient
          colors={isDark ? ["#0D2137", "#0A1A2E"] : ["#00BCD4", "#007D8A"]}
          style={st.hero}
        >
          <View style={st.heroLogo}>
            <Ionicons name="chatbubble-ellipses" size={40} color="#fff" />
          </View>
          <Text style={st.heroTitle}>AfuChat</Text>
          <Text style={st.heroTagline}>Connect with everyone, everywhere.</Text>
          <View style={st.heroPills}>
            <View style={st.heroPill}>
              <Text style={st.heroPillText}>v{APP_VERSION}</Text>
            </View>
            <View style={st.heroPill}>
              <Text style={st.heroPillText}>Build {BUILD}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* About description */}
        <View style={[st.section, { backgroundColor: colors.surface }]}>
          <Text style={[st.sectionTitle, { color: colors.text }]}>What is AfuChat?</Text>
          <Text style={[st.body, { color: colors.textSecondary }]}>
            AfuChat is a next-generation super-app that brings together messaging, social networking, an AI assistant, a digital wallet, freelance marketplace, community tools, digital events, and e-commerce — all in one seamless experience.
          </Text>
          <Text style={[st.body, { color: colors.textSecondary, marginTop: 10 }]}>
            Powered by ACoin, AfuChat lets you transact, earn, and grow within a single platform — whether you're chatting with friends, hiring a freelancer, attending a virtual event, or shopping from verified stores.
          </Text>
        </View>

        {/* Features */}
        <View style={[st.section, { backgroundColor: colors.surface }]}>
          <Text style={[st.sectionTitle, { color: colors.text }]}>Features</Text>
          <View style={st.featuresGrid}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[st.featureCard, { backgroundColor: colors.backgroundSecondary }]}>
                <View style={[st.featureIcon, { backgroundColor: f.color + "18" }]}>
                  <Ionicons name={f.icon as any} size={22} color={f.color} />
                </View>
                <Text style={[st.featureTitle, { color: colors.text }]}>{f.title}</Text>
                <Text style={[st.featureDesc, { color: colors.textMuted }]} numberOfLines={3}>{f.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* FAQ */}
        <View style={st.sectionHeader}>
          <Ionicons name="help-circle" size={18} color={colors.accent} />
          <Text style={[st.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Frequently Asked Questions</Text>
        </View>
        <View style={[st.faqCard, { backgroundColor: colors.surface }]}>
          {FAQ.map((item, i) => (
            <FaqItem key={i} item={item} />
          ))}
        </View>

        {/* Policies & Support */}
        <View style={st.sectionHeader}>
          <Ionicons name="list" size={18} color={colors.accent} />
          <Text style={[st.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Policies & Support</Text>
        </View>
        <View style={[st.legalCard, { backgroundColor: colors.surface }]}>
          {[
            { label: "Terms of Service",   sub: "Rules and conditions of use",          icon: "document-text-outline",    iconBg: "#007AFF18",   iconColor: "#007AFF",  route: "/terms"   },
            { label: "Privacy Policy",     sub: "How we collect and use your data",      icon: "shield-checkmark-outline", iconBg: "#34C75918",   iconColor: "#34C759",  route: "/privacy" },
            { label: "License",            sub: "Open-source licenses and attributions", icon: "ribbon-outline",           iconBg: "#5856D618",   iconColor: "#5856D6",  route: null,       info: "MIT License · © " + new Date().getFullYear() + " AfuChat" },
            { label: "Support Center",     sub: "Submit a ticket or browse help articles",icon: "help-buoy-outline",       iconBg: "#FF950018",   iconColor: "#FF9500",  route: "/support" },
            { label: "Email Support",      sub: "support@afuchat.com",                   icon: "mail-outline",             iconBg: "#00BCD418",   iconColor: "#00BCD4",  email: "support@afuchat.com" },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={[st.divider, { backgroundColor: colors.border }]} />}
              <TouchableOpacity
                style={st.legalRow}
                activeOpacity={item.info ? 1 : 0.7}
                onPress={() => {
                  if (item.email) { Linking.openURL(`mailto:${item.email}`); return; }
                  if (item.route) router.push(item.route as any);
                }}
              >
                <View style={[st.legalIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.legalLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[st.legalSub, { color: colors.textMuted }]}>{item.info ?? item.sub}</Text>
                </View>
                {!item.info && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Community & Open Source */}
        <View style={st.sectionHeader}>
          <Ionicons name="people" size={18} color={colors.accent} />
          <Text style={[st.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Connect With Us</Text>
        </View>
        <View style={[st.legalCard, { backgroundColor: colors.surface }]}>
          {[
            { label: "Telegram Channel",  sub: "t.me/afuchat",          icon: "paper-plane",    iconBg: "#0088CC18", iconColor: "#0088CC", url: "https://t.me/afuchat" },
            { label: "Founder",           sub: "t.me/amkaweesi",        icon: "person-circle",  iconBg: "#0088CC18", iconColor: "#0088CC", url: "https://t.me/amkaweesi" },
            { label: "Support Group",     sub: "t.me/afumeet",          icon: "people",         iconBg: "#229ED918", iconColor: "#229ED9", url: "https://t.me/afumeet" },
            { label: "WhatsApp Channel",  sub: "Follow on WhatsApp",    icon: "logo-whatsapp",  iconBg: "#25D36618", iconColor: "#25D366", url: "https://whatsapp.com/channel/0029Vb7Rbpz0Vyc9y3S8H422" },
            { label: "GitHub Repository", sub: "github.com/afuchat1/afuchat-supa", icon: "logo-github", iconBg: "#17171718", iconColor: isDark ? "#fff" : "#171717", url: "https://github.com/afuchat1/afuchat-supa" },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={[st.divider, { backgroundColor: colors.border }]} />}
              <TouchableOpacity
                style={st.legalRow}
                activeOpacity={0.7}
                onPress={() => Linking.openURL(item.url).catch(() => {})}
              >
                <View style={[st.legalIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.legalLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={[st.legalSub, { color: colors.textMuted }]}>{item.sub}</Text>
                </View>
                <Ionicons name="open-outline" size={15} color={colors.textMuted} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </View>

        {/* Footer — moved from Me tab */}
        <View style={st.footer}>
          <Image source={afuSymbol} style={[st.footerSymbol, { tintColor: colors.accent }]} resizeMode="contain" />
          <Text style={[st.footerName, { color: colors.text }]}>AfuChat</Text>
          <Text style={[st.footerVersion, { color: colors.textMuted }]}>Version {APP_VERSION} · Build {BUILD}</Text>
          <Text style={[st.footerCopy, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} AfuChat. All rights reserved.
          </Text>
          <Text style={[st.footerMission, { color: colors.textMuted }]}>
            Built with ❤️ to connect everyone, everywhere.
          </Text>
          <Text style={[st.footerMission, { color: colors.textMuted }]}>
            📍 Entebbe, Kitooro — Uganda
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBack: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 16, fontWeight: "700" },

  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  heroLogo: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 32, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heroTagline: { fontSize: 15, color: "rgba(255,255,255,0.75)", textAlign: "center" },
  heroPills: { flexDirection: "row", gap: 8, marginTop: 6 },
  heroPill: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  heroPillText: { fontSize: 12, color: "#fff", fontWeight: "600" },

  section: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 22 },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  featureCard: {
    width: "47%",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  featureIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontSize: 13, fontWeight: "700" },
  featureDesc: { fontSize: 11, lineHeight: 16 },

  faqCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  faqItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  faqRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  faqA: { fontSize: 13, lineHeight: 21, marginTop: 10 },

  legalCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  legalRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  legalIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  legalLabel: { flex: 1, fontSize: 15, fontWeight: "600" },
  legalSub: { fontSize: 12, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66 },

  footer: { alignItems: "center", paddingTop: 36, paddingBottom: 16, gap: 6 },
  footerSymbol: { width: 28, height: 28, marginBottom: 4 },
  footerName: { fontSize: 16, fontWeight: "800" },
  footerVersion: { fontSize: 12 },
  footerCopy: { fontSize: 12, marginTop: 4 },
  footerMission: { fontSize: 12, marginTop: 2 },
});
