import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

const LAST_UPDATED = "March 30, 2026";

type Clause = { heading: string; body: string };
type Section = { title: string; clauses: Clause[] };

const SECTIONS: Section[] = [
  {
    title: "1. General Terms of Service",
    clauses: [
      {
        heading: "1.1 Acceptance of Terms",
        body: `By accessing or using AfuChat ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Platform. We may update these Terms at any time; continued use constitutes acceptance.`,
      },
      {
        heading: "1.2 Eligibility",
        body: "You must be at least 13 years old to use AfuChat. If you are under 18, parental or guardian consent is required. By using the Platform you represent that you meet these requirements.",
      },
      {
        heading: "1.3 Account Registration",
        body: "You agree to provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your credentials and for all activity under your account. Notify us immediately of any unauthorized access.",
      },
      {
        heading: "1.4 User Content",
        body: "You retain ownership of content you post. By posting, you grant AfuChat a non-exclusive, worldwide, royalty-free license to use, display, reproduce, and distribute your content in connection with operating the Platform. You agree not to post content that is illegal, harmful, abusive, defamatory, or otherwise objectionable.",
      },
      {
        heading: "1.5 Prohibited Conduct",
        body: "You agree not to:\n\n• Use the Platform for any unlawful purpose\n• Harass, bully, or intimidate other users\n• Post spam, misleading content, or unauthorized advertising\n• Impersonate any person or entity\n• Attempt unauthorized access to other accounts or systems\n• Use bots or automated scripts without permission\n• Distribute malware or engage in phishing\n• Violate any applicable laws or regulations",
      },
      {
        heading: "1.6 Intellectual Property",
        body: "The Platform and its original content, features, and functionality are owned by AfuChat and protected by international copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works without our express written permission.",
      },
      {
        heading: "1.7 Termination",
        body: "We may terminate or suspend your account at any time, without prior notice, for any reason including breach of these Terms. Upon termination, your right to use the Platform ceases immediately. You may also delete your account at any time via app settings.",
      },
      {
        heading: "1.8 Disclaimer of Warranties",
        body: `The Platform is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. We do not warrant that the Platform will be uninterrupted, error-free, or secure. Your use of the Platform is at your sole risk.`,
      },
      {
        heading: "1.9 Limitation of Liability",
        body: "To the maximum extent permitted by law, AfuChat shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, revenues, data, or goodwill resulting from your use of the Platform.",
      },
      {
        heading: "1.10 Governing Law",
        body: "These Terms are governed by and construed in accordance with the laws of the Republic of Uganda, without regard to conflict of law provisions.",
      },
      {
        heading: "1.11 Contact",
        body: "Questions about these Terms? Contact us at:\n\nEmail: legal@afuchat.com\nWebsite: https://afuchat.com",
      },
    ],
  },
  {
    title: "2. AfuMarket Terms",
    clauses: [
      {
        heading: "2.1 Eligibility to Sell",
        body: "Only accounts with verified organization status may list products on AfuMarket. To become a verified seller, you must submit a seller application with valid business information. AfuChat reserves the right to approve or reject applications at its sole discretion.",
      },
      {
        heading: "2.2 Listing Standards",
        body: "Sellers must provide accurate product descriptions, genuine images, and correct pricing in ACoins (AC). Listings that are misleading, duplicate, or violate community guidelines will be removed. Prohibited categories include: counterfeit goods, illegal items, dangerous substances, adult content, and services that violate AfuChat's policies.",
      },
      {
        heading: "2.3 Pricing & Fees",
        body: "All products are priced in AfuCoins (AC). AfuChat charges a 5% platform fee on every completed transaction. The fee is deducted from the escrowed amount before it is released to the seller. Example: A 100 AC sale yields 95 AC to the seller; 5 AC goes to the platform.",
      },
      {
        heading: "2.4 AfuPay Escrow System",
        body: "When a buyer places an order:\n\n1. Payment is deducted from the buyer's AfuPay wallet immediately\n2. Funds are held in escrow — neither party can access them\n3. When the buyer confirms receipt, funds minus the platform fee are released to the seller\n4. If no confirmation is given within 14 days of shipping, funds are auto-released\n\nFunds will not be released while a dispute is open.",
      },
      {
        heading: "2.5 Buyer Protections",
        body: "Buyers may raise a dispute if:\n\n• Item was not received within the stated delivery time\n• Item received does not match the listing description\n• Item arrived damaged or non-functional\n\nDisputes must be raised within 7 days of the seller marking the item as shipped. AfuChat will investigate and issue a resolution within 5 business days.",
      },
      {
        heading: "2.6 Seller Obligations",
        body: "Sellers must:\n\n• Fulfill orders within the stated processing time\n• Mark orders as shipped with valid tracking information where applicable\n• Respond to buyer messages within 48 hours\n• Honor their stated return and refund policies\n• Not engage in price gouging or artificial scarcity\n\nFailure to meet these obligations may result in account suspension and automatic refunds to buyers.",
      },
      {
        heading: "2.7 Refunds & Returns",
        body: "Refunds are issued at AfuChat's discretion following dispute resolution. Approved refunds return the full purchase amount to the buyer's AfuPay wallet. Platform fees are not refunded in cases of seller fault. Sellers may set their own voluntary return policies within the limits of these terms.",
      },
      {
        heading: "2.8 Prohibited Transactions",
        body: "The following are strictly prohibited on AfuMarket:\n\n• Transacting outside AfuPay (cash, bank transfer, etc.) for items listed on the platform\n• Soliciting buyers to complete transactions off-platform\n• Creating fake reviews or manipulating ratings\n• Operating multiple seller accounts to circumvent restrictions",
      },
    ],
  },
  {
    title: "3. ACoins & AfuPay Terms",
    clauses: [
      {
        heading: "3.1 What Are ACoins?",
        body: "ACoins (AC) are AfuChat's sole virtual currency used across all platform services including AfuMarket, gifts, subscriptions, and tipping. ACoins have no real-world monetary value and cannot be exchanged for cash, cryptocurrency, or any fiat currency.",
      },
      {
        heading: "3.2 Acquiring ACoins",
        body: "ACoins may be acquired through:\n\n• In-app purchases (AC packs)\n• Nexa conversion via Afu Exchange\n• Receiving gifts or payments from other users\n• Platform rewards and promotions\n\nACoins purchased directly from AfuChat are non-refundable once credited to your wallet.",
      },
      {
        heading: "3.3 AfuPay Wallet",
        body: "Every AfuChat account comes with an AfuPay wallet. Your wallet balance is maintained in the AfuChat database and is accessible only through the official AfuChat application. You may not transfer ACoins outside the platform.",
      },
      {
        heading: "3.4 Transaction Security",
        body: "All transactions use optimistic locking to prevent double-spending. Transactions are atomic — they either complete fully or are rolled back entirely. All balance changes are recorded in the ACoins transaction ledger for audit purposes. In case of discrepancy, the ledger record is authoritative.",
      },
      {
        heading: "3.5 Nexa Currency",
        body: "Nexa is a secondary virtual currency earned through social engagement. Nexa can be converted to ACoins via Afu Exchange at rates set by AfuChat. Nexa cannot be purchased directly. Conversion rates may change without prior notice.",
      },
      {
        heading: "3.6 Expired & Forfeited ACoins",
        body: "Promotional ACoins may carry expiry dates. Purchased ACoins do not expire as long as your account remains active. ACoins are forfeited upon permanent account deletion. AfuChat reserves the right to adjust balances in cases of fraud or error.",
      },
      {
        heading: "3.7 No Real-World Value",
        body: "ACoins and Nexa are virtual items that exist solely within the AfuChat ecosystem. They are not investments, securities, or financial instruments. AfuChat provides no guarantee of their continued availability. All purchases are final.",
      },
    ],
  },
  {
    title: "4. Privacy Policy",
    clauses: [
      {
        heading: "4.1 Information We Collect",
        body: "We collect:\n\n• Account information: name, email, phone number, date of birth\n• Profile data: display name, handle, bio, profile photo\n• Usage data: features used, content viewed, interactions made\n• Device information: device type, OS, IP address, push token\n• Location data: approximate location for geo-based features (with your permission)\n• Payment data: AfuPay transaction history (not payment card details)",
      },
      {
        heading: "4.2 How We Use Your Information",
        body: "We use your information to:\n\n• Provide and improve the Platform\n• Personalize your experience and feed\n• Send notifications about your account and activity\n• Process transactions and maintain the AfuPay ledger\n• Detect fraud and enforce our policies\n• Comply with legal obligations\n• Send marketing communications (which you may opt out of)",
      },
      {
        heading: "4.3 Data Sharing",
        body: "We do not sell your personal information to third parties. We may share data with:\n\n• Service providers who help operate the Platform (under confidentiality agreements)\n• Legal authorities when required by law\n• Other users to the extent you choose to make your profile public\n\nWith other users, only your public profile information is shared unless you explicitly choose to share more.",
      },
      {
        heading: "4.4 Data Storage & Security",
        body: "Your data is stored on Supabase-managed PostgreSQL servers with encryption at rest and in transit. We implement industry-standard security practices including row-level security policies. No system is 100% secure; we will notify you of any significant data breach within 72 hours.",
      },
      {
        heading: "4.5 Your Rights",
        body: "You have the right to:\n\n• Access a copy of your personal data\n• Correct inaccurate information\n• Delete your account and associated data\n• Opt out of marketing communications\n• Object to certain types of processing\n\nTo exercise these rights, contact privacy@afuchat.com. Account deletion requests are processed within 30 days.",
      },
      {
        heading: "4.6 Cookies & Web Tracking",
        body: "On web, we use local storage and session cookies to maintain your session. We do not use third-party advertising cookies or tracking pixels. You may disable cookies in your browser settings, but some features may not function correctly.",
      },
      {
        heading: "4.7 Children's Privacy",
        body: "AfuChat is not intended for children under 13. We do not knowingly collect personal information from children under 13. If we discover we have collected data from a child under 13, we will delete it promptly. If you believe a child under 13 has created an account, contact privacy@afuchat.com.",
      },
      {
        heading: "4.8 Changes to This Policy",
        body: "We may update this Privacy Policy from time to time. We will notify you of significant changes via in-app notification or email. Your continued use of the Platform after changes constitutes acceptance of the updated policy.",
      },
    ],
  },
  {
    title: "5. Community Guidelines",
    clauses: [
      {
        heading: "5.1 Be Respectful",
        body: "Treat all users with dignity and respect. Harassment, bullying, hate speech, and discrimination based on race, ethnicity, religion, gender, sexual orientation, disability, or any other characteristic are strictly prohibited.",
      },
      {
        heading: "5.2 Authentic Identity",
        body: "You must be yourself. Impersonating real people, celebrities, public figures, or other AfuChat users is prohibited. Parody accounts must clearly identify themselves as such. Using AI-generated profile photos without disclosure is not permitted.",
      },
      {
        heading: "5.3 Safe Content",
        body: "AfuChat is a general-audience platform. Explicit sexual content, graphic violence, and gore are prohibited. Content depicting or promoting child exploitation will result in immediate account termination and referral to law enforcement.",
      },
      {
        heading: "5.4 No Misinformation",
        body: "Do not share content you know to be false, especially regarding health, elections, or public safety. Coordinated inauthentic behavior (running bot networks, astroturfing) to manipulate trends or sentiment is strictly prohibited.",
      },
      {
        heading: "5.5 Spam & Commercial Activity",
        body: "Unsolicited promotional content, chain messages, and spam are prohibited. Commercial activity is permitted only through official channels — AfuMarket for products, and verified business profiles for promotion.",
      },
      {
        heading: "5.6 Reporting & Enforcement",
        body: "Users may report violations via the in-app report feature. Reports are reviewed by our moderation team. Consequences range from content removal to temporary suspension to permanent termination, depending on severity and history. You may appeal decisions by contacting support@afuchat.com.",
      },
    ],
  },
  {
    title: "6. Mini-Apps & Developer Terms",
    clauses: [
      {
        heading: "6.1 Mini-App Platform",
        body: "AfuChat provides a mini-app platform allowing third-party developers to build lightweight applications that run inside AfuChat. All mini-apps must be approved by AfuChat before publication.",
      },
      {
        heading: "6.2 Developer Obligations",
        body: "Developers must:\n\n• Adhere to AfuChat's API usage policies\n• Not collect user data beyond what is necessary for the mini-app\n• Not use AfuChat APIs to build competing services\n• Maintain their apps and respond to reports within 5 business days\n• Not inject malicious code or engage in deceptive practices",
      },
      {
        heading: "6.3 Revenue & Monetization",
        body: "Mini-app developers may monetize through ACoins. AfuChat takes a 10% revenue share on all ACoins spent within mini-apps. External payment methods are prohibited within mini-apps.",
      },
      {
        heading: "6.4 Data & Privacy",
        body: "Mini-apps may only access user data with explicit user consent. Collected data must be treated in accordance with AfuChat's Privacy Policy and applicable data protection laws. Data may not be sold or shared with third parties.",
      },
      {
        heading: "6.5 Termination of Mini-Apps",
        body: "AfuChat may remove any mini-app that violates these terms, poses security risks, or degrades platform performance. Developers will be notified with a 14-day remediation window for non-critical violations.",
      },
    ],
  },
];

export default function TermsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace("/" as any)}
          style={st.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: colors.text }]}>Terms & Policies</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
      >
        {/* Intro */}
        <View style={st.intro}>
          <Text style={[st.introTitle, { color: colors.text }]}>AfuChat Terms of Service</Text>
          <Text style={[st.introMeta, { color: colors.textMuted }]}>
            Last updated: {LAST_UPDATED}
          </Text>
          <Text style={[st.introBody, { color: colors.textMuted }]}>
            Please read these terms carefully before using AfuChat. By creating an account or using the platform, you agree to these terms. These policies apply to all AfuChat services including messaging, AfuMarket, and AfuPay.
          </Text>
        </View>

        <View style={[st.divider, { backgroundColor: colors.border }]} />

        {/* Sections */}
        {SECTIONS.map((section, sIdx) => (
          <View key={sIdx}>
            <View style={st.sectionBlock}>
              <Text style={[st.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              {section.clauses.map((clause, cIdx) => (
                <View key={cIdx} style={st.clauseBlock}>
                  <Text style={[st.clauseHeading, { color: colors.text }]}>{clause.heading}</Text>
                  <Text style={[st.clauseBody, { color: colors.textMuted }]}>{clause.body}</Text>
                </View>
              ))}
            </View>
            {sIdx < SECTIONS.length - 1 && (
              <View style={[st.divider, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}

        {/* Footer */}
        <View style={[st.footer, { borderTopColor: colors.border }]}>
          <Text style={[st.footerText, { color: colors.textMuted }]}>
            AfuChat · Republic of Uganda · legal@afuchat.com
          </Text>
          <Text style={[st.footerText, { color: colors.textMuted }]}>
            © {new Date().getFullYear()} AfuChat. All rights reserved.
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
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  intro: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, gap: 8 },
  introTitle: { fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 28 },
  introMeta: { fontSize: 13, fontFamily: "Inter_400Regular" },
  introBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginTop: 4 },

  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20, marginVertical: 4 },

  sectionBlock: { paddingHorizontal: 20, paddingVertical: 24, gap: 20 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 24, marginBottom: 4 },

  clauseBlock: { gap: 6 },
  clauseHeading: { fontSize: 15, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
  clauseBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 23 },

  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 4,
    alignItems: "center",
  },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
});
