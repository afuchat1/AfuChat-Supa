import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

const BRAND = "#00BCD4";
const LAST_UPDATED = "March 30, 2026";

type Section = {
  id: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  clauses: { heading: string; body: string }[];
};

const SECTIONS: Section[] = [
  {
    id: "general",
    icon: "document-text-outline",
    color: BRAND,
    title: "General Terms of Service",
    subtitle: "Core rules that apply to all AfuChat services",
    clauses: [
      {
        heading: "1. Acceptance of Terms",
        body: "By accessing or using AfuChat ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Platform. We may update these Terms at any time; continued use constitutes acceptance.",
      },
      {
        heading: "2. Eligibility",
        body: "You must be at least 13 years old to use AfuChat. If you are under 18, parental or guardian consent is required. By using the Platform you represent that you meet these requirements.",
      },
      {
        heading: "3. Account Registration",
        body: "You agree to provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. Notify us immediately of any unauthorized access.",
      },
      {
        heading: "4. User Content",
        body: "You retain ownership of content you post. By posting, you grant AfuChat a non-exclusive, worldwide, royalty-free license to use, display, reproduce, and distribute your content in connection with operating the Platform. You agree not to post content that is illegal, harmful, abusive, defamatory, or otherwise objectionable.",
      },
      {
        heading: "5. Prohibited Conduct",
        body: "You agree not to:\n• Use the Platform for any unlawful purpose\n• Harass, bully, or intimidate other users\n• Post spam, misleading content, or unauthorized advertising\n• Impersonate any person or entity\n• Attempt unauthorized access to other accounts or systems\n• Use bots or automated scripts without permission\n• Distribute malware or engage in phishing\n• Violate any applicable laws or regulations",
      },
      {
        heading: "6. Intellectual Property",
        body: "The Platform and its original content, features, and functionality are owned by AfuChat and protected by international copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.",
      },
      {
        heading: "7. Termination",
        body: "We may terminate or suspend your account at any time, without prior notice, for any reason including breach of these Terms. Upon termination, your right to use the Platform ceases immediately. You may also delete your account at any time via app settings.",
      },
      {
        heading: "8. Disclaimer of Warranties",
        body: "The Platform is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. We do not warrant that the Platform will be uninterrupted, error-free, or secure. Your use of the Platform is at your sole risk.",
      },
      {
        heading: "9. Limitation of Liability",
        body: "To the maximum extent permitted by law, AfuChat shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenues, data, or goodwill resulting from your use of the Platform.",
      },
      {
        heading: "10. Governing Law",
        body: "These Terms are governed by and construed in accordance with the laws of the Republic of Uganda, without regard to conflict of law provisions.",
      },
      {
        heading: "11. Contact",
        body: "Questions about these Terms? Contact us at:\n\nEmail: legal@afuchat.com\nWebsite: https://afuchat.com",
      },
    ],
  },
  {
    id: "marketplace",
    icon: "storefront-outline",
    color: "#34C759",
    title: "AfuMarket Terms",
    subtitle: "Rules for buying and selling on the AfuChat marketplace",
    clauses: [
      {
        heading: "Eligibility to Sell",
        body: "Only accounts with is_organization_verified status may list products on AfuMarket. To become a verified seller, you must submit a seller application with valid business information. AfuChat reserves the right to approve or reject applications at its sole discretion.",
      },
      {
        heading: "Listing Standards",
        body: "Sellers must provide accurate product descriptions, genuine images, and correct pricing in ACoins (AC). Listings that are misleading, duplicate, or violate community guidelines will be removed. Prohibited categories include: counterfeit goods, illegal items, dangerous substances, adult content, and services that violate AfuChat's policies.",
      },
      {
        heading: "Pricing & Fees",
        body: "All products are priced in AfuCoins (AC). AfuChat charges a 5% platform fee on every completed transaction. The fee is deducted from the escrowed amount before it is released to the seller. Example: A 100 AC sale yields 95 AC to the seller; 5 AC goes to the platform.",
      },
      {
        heading: "AfuPay Escrow System",
        body: "When a buyer places an order:\n1. Payment is deducted from the buyer's AfuPay wallet immediately\n2. Funds are held in escrow (neither buyer nor seller can access them)\n3. When the buyer confirms receipt, funds minus platform fee are released to the seller\n4. If no confirmation is given within 14 days of shipping, funds are auto-released\n\nFunds will NOT be released if a dispute is open.",
      },
      {
        heading: "Buyer Protections",
        body: "Buyers may raise a dispute if:\n• Item was not received within the stated delivery time\n• Item received does not match the listing description\n• Item arrived damaged or non-functional\n\nDisputes must be raised within 7 days of the seller marking the item as shipped. AfuChat will investigate and issue a resolution within 5 business days.",
      },
      {
        heading: "Seller Obligations",
        body: "Sellers must:\n• Fulfill orders within the stated processing time\n• Mark orders as shipped with valid tracking information where applicable\n• Respond to buyer messages within 48 hours\n• Honor their stated return/refund policies\n• Not engage in price gouging or artificial scarcity\n\nFailure to meet these obligations may result in account suspension and automatic refunds to buyers.",
      },
      {
        heading: "Refunds & Returns",
        body: "Refunds are issued at AfuChat's discretion following dispute resolution. Approved refunds return the full purchase amount to the buyer's AfuPay wallet. Platform fees are not refunded in cases of seller fault. Sellers may set their own voluntary return policies within the limits of these terms.",
      },
      {
        heading: "Prohibited Transactions",
        body: "The following are strictly prohibited on AfuMarket:\n• Transacting outside AfuPay (cash, bank transfer, etc.) for items listed on the platform\n• Soliciting buyers to complete transactions off-platform\n• Creating fake reviews or manipulating ratings\n• Operating multiple seller accounts to circumvent restrictions",
      },
    ],
  },
  {
    id: "acoins",
    icon: "wallet-outline",
    color: "#D4A853",
    title: "ACoins & AfuPay Terms",
    subtitle: "Virtual currency rules, wallet usage, and payment policies",
    clauses: [
      {
        heading: "What Are ACoins (AC)?",
        body: "ACoins (AC) are AfuChat's sole virtual currency used across all platform services including AfuMarket, gifts, subscriptions, and tipping. ACoins have no real-world monetary value and cannot be exchanged for cash, cryptocurrency, or any fiat currency.",
      },
      {
        heading: "Acquiring ACoins",
        body: "ACoins may be acquired through:\n• In-app purchases (AC packs)\n• Nexa conversion (via Afu Exchange)\n• Receiving gifts or payments from other users\n• Platform rewards and promotions\n\nACoins purchased directly from AfuChat are non-refundable once credited to your wallet.",
      },
      {
        heading: "AfuPay Wallet",
        body: "Every AfuChat account comes with an AfuPay wallet. Your wallet balance is maintained in the AfuChat database and is accessible only through the official AfuChat application. You may not transfer ACoins outside the platform.",
      },
      {
        heading: "Transaction Security",
        body: "All transactions use optimistic locking to prevent double-spending. Transactions are atomic — they either complete fully or are rolled back entirely. All balance changes are recorded in the acoin_transactions ledger for audit purposes. In case of discrepancy, the ledger record is authoritative.",
      },
      {
        heading: "Nexa Currency",
        body: "Nexa is a secondary virtual currency earned through social engagement (likes, shares, etc.). Nexa can be converted to ACoins via Afu Exchange at rates set by AfuChat. Nexa cannot be purchased directly. Conversion rates may change without prior notice.",
      },
      {
        heading: "Expired & Forfeited ACoins",
        body: "Promotional ACoins (awarded via campaigns, referrals, or bonuses) may carry expiry dates. Purchased ACoins do not expire as long as your account remains active. ACoins are forfeited upon permanent account deletion. AfuChat reserves the right to adjust balances in cases of fraud or error.",
      },
      {
        heading: "No Real-World Value",
        body: "ACoins and Nexa are virtual items that exist solely within the AfuChat ecosystem. They are not investments, securities, or financial instruments. AfuChat provides no guarantee of their continued availability. All purchases are final.",
      },
    ],
  },
  {
    id: "privacy",
    icon: "shield-checkmark-outline",
    color: "#5856D6",
    title: "Privacy Policy",
    subtitle: "How we collect, use, and protect your personal information",
    clauses: [
      {
        heading: "Information We Collect",
        body: "We collect:\n• Account information: name, email, phone number, date of birth\n• Profile data: display name, handle, bio, profile photo\n• Usage data: features used, content viewed, interactions made\n• Device information: device type, OS, IP address, push token\n• Location data: approximate location for geo-based features (with your permission)\n• Payment data: AfuPay transaction history (not payment card details)",
      },
      {
        heading: "How We Use Your Information",
        body: "We use your information to:\n• Provide and improve the Platform\n• Personalize your experience and feed\n• Send notifications about your account and activity\n• Process transactions and maintain the AfuPay ledger\n• Detect fraud and enforce our policies\n• Comply with legal obligations\n• Send marketing communications (which you may opt out of)",
      },
      {
        heading: "Data Sharing",
        body: "We do not sell your personal information to third parties. We may share data with:\n• Service providers who help operate the Platform (under confidentiality agreements)\n• Legal authorities when required by law\n• Other users to the extent you choose to make your profile public\n\nWith other users, only your public profile information is shared unless you explicitly choose to share more.",
      },
      {
        heading: "Data Storage & Security",
        body: "Your data is stored on Supabase-managed PostgreSQL servers with encryption at rest and in transit. We implement industry-standard security practices including row-level security (RLS) policies. No system is 100% secure; we will notify you of any significant data breach within 72 hours.",
      },
      {
        heading: "Your Rights",
        body: "You have the right to:\n• Access a copy of your personal data\n• Correct inaccurate information\n• Delete your account and associated data\n• Opt out of marketing communications\n• Object to certain types of processing\n\nTo exercise these rights, contact privacy@afuchat.com. Account deletion requests are processed within 30 days.",
      },
      {
        heading: "Cookies & Web Tracking",
        body: "On web, we use local storage and session cookies to maintain your session. We do not use third-party advertising cookies or tracking pixels. You may disable cookies in your browser settings, but some features may not function correctly.",
      },
      {
        heading: "Children's Privacy",
        body: "AfuChat is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we discover we have collected data from a child under 13, we will delete it promptly. If you believe a child under 13 has created an account, contact us at privacy@afuchat.com.",
      },
      {
        heading: "Changes to This Policy",
        body: "We may update this Privacy Policy from time to time. We will notify you of significant changes via in-app notification or email. Your continued use of the Platform after changes constitutes acceptance of the updated policy.",
      },
    ],
  },
  {
    id: "community",
    icon: "people-outline",
    color: "#FF9500",
    title: "Community Guidelines",
    subtitle: "Standards for respectful behavior on AfuChat",
    clauses: [
      {
        heading: "Be Respectful",
        body: "Treat all users with dignity and respect. Harassment, bullying, hate speech, and discrimination based on race, ethnicity, religion, gender, sexual orientation, disability, or any other characteristic are strictly prohibited.",
      },
      {
        heading: "Authentic Identity",
        body: "You must be yourself. Impersonating real people, celebrities, public figures, or other AfuChat users is prohibited. Parody accounts must clearly identify themselves as such. Using AI-generated profile photos without disclosure is not permitted.",
      },
      {
        heading: "Safe Content",
        body: "AfuChat is a general-audience platform. Explicit sexual content, graphic violence, and gore are prohibited. Content depicting or promoting child exploitation will result in immediate account termination and referral to law enforcement.",
      },
      {
        heading: "No Misinformation",
        body: "Do not share content you know to be false, especially regarding health, elections, or public safety. Coordinated inauthentic behavior (running bot networks, astroturfing) to manipulate trends or sentiment is strictly prohibited.",
      },
      {
        heading: "Spam & Commercial Activity",
        body: "Unsolicited promotional content, chain messages, and spam are prohibited. Commercial activity is permitted only through official channels (AfuMarket for products; verified business profiles for promotion).",
      },
      {
        heading: "Reporting & Enforcement",
        body: "Users may report violations via the in-app report feature. Reports are reviewed by our moderation team. Consequences range from content removal to temporary suspension to permanent termination, depending on severity and history. You may appeal decisions by contacting support@afuchat.com.",
      },
    ],
  },
  {
    id: "miniapps",
    icon: "grid-outline",
    color: "#AF52DE",
    title: "Mini-Apps & Developer Terms",
    subtitle: "Rules for building and using mini-programs within AfuChat",
    clauses: [
      {
        heading: "Mini-App Platform",
        body: "AfuChat provides a mini-app platform allowing third-party developers to build lightweight applications that run inside AfuChat. All mini-apps must be approved by AfuChat before publication.",
      },
      {
        heading: "Developer Obligations",
        body: "Developers must:\n• Adhere to AfuChat's API usage policies\n• Not collect user data beyond what is necessary for the mini-app\n• Not use AfuChat APIs to build competing services\n• Maintain their apps and respond to reports within 5 business days\n• Not inject malicious code or engage in deceptive practices",
      },
      {
        heading: "Revenue & Monetization",
        body: "Mini-app developers may monetize through ACoins. AfuChat takes a 10% revenue share on all ACoins spent within mini-apps. External payment methods are prohibited within mini-apps.",
      },
      {
        heading: "Data & Privacy",
        body: "Mini-apps may only access user data with explicit user consent. Collected data must be treated in accordance with AfuChat's Privacy Policy and applicable data protection laws. Data may not be sold or shared with third parties.",
      },
      {
        heading: "Termination of Mini-Apps",
        body: "AfuChat may remove any mini-app that violates these terms, poses security risks, or degrades platform performance. Developers will be notified with a 14-day remediation window for non-critical violations.",
      },
    ],
  },
];

function AccordionSection({
  section,
  initiallyOpen,
  scrollRef,
  sectionIndex,
}: {
  section: Section;
  initiallyOpen: boolean;
  scrollRef: React.RefObject<ScrollView>;
  sectionIndex: number;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const [openClauses, setOpenClauses] = useState<Set<number>>(
    initiallyOpen ? new Set(section.clauses.map((_, i) => i)) : new Set()
  );
  const anim = useRef(new Animated.Value(initiallyOpen ? 1 : 0)).current;
  const sectionRef = useRef<View>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) setOpenClauses(new Set(section.clauses.map((_, i) => i)));
    else setOpenClauses(new Set());
    Animated.spring(anim, { toValue: next ? 1 : 0, useNativeDriver: true, damping: 20, stiffness: 120 }).start();
  }

  function toggleClause(idx: number) {
    setOpenClauses(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View ref={sectionRef} style={[st.sectionCard, { backgroundColor: colors.surface }]}>
      <TouchableOpacity onPress={toggle} style={st.sectionHeader} activeOpacity={0.8}>
        <LinearGradient
          colors={[section.color + "25", section.color + "08"]}
          style={[st.sectionIconWrap]}
        >
          <Ionicons name={section.icon as any} size={22} color={section.color} />
        </LinearGradient>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.sectionTitle, { color: colors.text }]}>{section.title}</Text>
          <Text style={[st.sectionSub, { color: colors.textMuted }]}>{section.subtitle}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={[st.clauseList, { borderTopColor: colors.border }]}>
          {section.clauses.map((clause, idx) => (
            <View key={idx} style={[st.clauseItem, idx < section.clauses.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <TouchableOpacity
                style={st.clauseHeader}
                onPress={() => toggleClause(idx)}
                activeOpacity={0.7}
              >
                <View style={[st.clauseNum, { backgroundColor: section.color + "15" }]}>
                  <Text style={[st.clauseNumText, { color: section.color }]}>{idx + 1}</Text>
                </View>
                <Text style={[st.clauseHeading, { color: colors.text, flex: 1 }]}>{clause.heading}</Text>
                <Ionicons
                  name={openClauses.has(idx) ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
              {openClauses.has(idx) && (
                <Text style={[st.clauseBody, { color: colors.textSecondary }]}>{clause.body}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function TermsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [targetSection, setTargetSection] = useState<string | null>(sectionParam || null);

  useEffect(() => {
    if (sectionParam) setTargetSection(sectionParam);
  }, [sectionParam]);

  const sectionRefs = useRef<Record<string, View | null>>({});
  const sectionYPositions = useRef<Record<string, number>>({});

  const scrollToSection = useCallback((sectionId: string) => {
    const y = sectionYPositions.current[sectionId];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }
  }, []);

  useEffect(() => {
    if (targetSection) {
      const timer = setTimeout(() => scrollToSection(targetSection), 600);
      return () => clearTimeout(timer);
    }
  }, [targetSection, scrollToSection]);

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <View style={[st.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace("/" as any)}
          style={{ padding: 4 }}
        >
          <Ionicons name={Platform.OS === "web" ? "arrow-back" : "close"} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Terms & Policies</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 60 }]}
      >
        {/* Hero */}
        <LinearGradient colors={[BRAND + "20", BRAND + "06", "transparent"]} style={st.hero}>
          <LinearGradient colors={[BRAND, "#0097A7"]} style={st.heroIcon}>
            <Ionicons name="shield-checkmark" size={32} color="#fff" />
          </LinearGradient>
          <Text style={[st.heroTitle, { color: colors.text }]}>AfuChat Terms & Policies</Text>
          <Text style={[st.heroSub, { color: colors.textSecondary }]}>
            Last updated: {LAST_UPDATED} · Governing law: Republic of Uganda
          </Text>
          <Text style={[st.heroBody, { color: colors.textMuted }]}>
            These policies apply to all AfuChat services. Tap any section to expand it. Tap any clause to read the full text.
          </Text>
        </LinearGradient>

        {/* Quick nav */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.quickNav}>
          {SECTIONS.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[st.navChip, { backgroundColor: s.color + "15", borderColor: s.color + "30" }]}
              onPress={() => scrollToSection(s.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={s.icon as any} size={14} color={s.color} />
              <Text style={[st.navChipText, { color: s.color }]}>{s.title.split(" ")[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Sections */}
        {SECTIONS.map((section, idx) => (
          <View
            key={section.id}
            ref={(ref) => { sectionRefs.current[section.id] = ref; }}
            onLayout={(e) => { sectionYPositions.current[section.id] = e.nativeEvent.layout.y; }}
          >
            <AccordionSection
              section={section}
              initiallyOpen={targetSection === section.id}
              scrollRef={scrollRef}
              sectionIndex={idx}
            />
          </View>
        ))}

        {/* Footer */}
        <View style={[st.footer, { borderTopColor: colors.border }]}>
          <Text style={[st.footerText, { color: colors.textMuted }]}>
            These policies were last updated on {LAST_UPDATED}. For questions, contact{" "}
            <Text style={{ color: BRAND }}>legal@afuchat.com</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  content: { gap: 12, padding: 16 },
  hero: { borderRadius: 20, padding: 24, alignItems: "center", gap: 8, marginBottom: 4 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  heroBody: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19, marginTop: 4 },
  quickNav: { gap: 8, paddingBottom: 8 },
  navChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  navChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 18,
  },
  sectionIconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  clauseList: { borderTopWidth: StyleSheet.hairlineWidth },
  clauseItem: { paddingHorizontal: 18 },
  clauseHeader: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14,
  },
  clauseNum: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
  },
  clauseNumText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  clauseHeading: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  clauseBody: {
    fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 21,
    paddingLeft: 38, paddingBottom: 14,
  },
  footer: { marginTop: 8, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
});
