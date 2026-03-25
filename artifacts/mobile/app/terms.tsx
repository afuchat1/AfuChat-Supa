import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

const LAST_UPDATED = "March 25, 2026";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using AfuChat ("the Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Platform. We reserve the right to update these Terms at any time, and your continued use of the Platform constitutes acceptance of any changes.`,
  },
  {
    title: "2. Eligibility",
    body: `You must be at least 13 years of age to use AfuChat. By using the Platform, you represent and warrant that you meet the minimum age requirement and have the legal capacity to enter into these Terms. If you are under 18, you must have parental or guardian consent.`,
  },
  {
    title: "3. Account Registration",
    body: `To access certain features, you must create an account. You agree to provide accurate, current, and complete information during registration and to keep your account information updated. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account. Notify us immediately of any unauthorized use.`,
  },
  {
    title: "4. User Content",
    body: `You retain ownership of content you post on AfuChat. By posting content, you grant AfuChat a non-exclusive, worldwide, royalty-free license to use, display, reproduce, and distribute your content in connection with operating the Platform. You agree not to post content that is illegal, harmful, threatening, abusive, defamatory, obscene, or otherwise objectionable.`,
  },
  {
    title: "5. Prohibited Conduct",
    body: `You agree not to:\n• Use the Platform for any unlawful purpose\n• Harass, bully, or intimidate other users\n• Post spam, misleading content, or unauthorized advertising\n• Impersonate any person or entity\n• Attempt to gain unauthorized access to other accounts or systems\n• Use automated bots or scripts without permission\n• Distribute malware or engage in phishing\n• Violate any applicable laws or regulations`,
  },
  {
    title: "6. Virtual Currency and Purchases",
    body: `AfuChat may offer virtual currencies (such as Nexa and Acoin) and premium subscriptions. Virtual currencies have no real-world monetary value and cannot be exchanged for cash. All purchases are final and non-refundable unless required by applicable law. We reserve the right to modify pricing, availability, and features of virtual items and subscriptions at any time.`,
  },
  {
    title: "7. Privacy",
    body: `Your use of the Platform is also governed by our Privacy Policy, which describes how we collect, use, and protect your personal information. By using AfuChat, you consent to the practices described in our Privacy Policy.`,
  },
  {
    title: "8. Intellectual Property",
    body: `The Platform and its original content, features, and functionality are owned by AfuChat and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on the Platform without our express written permission.`,
  },
  {
    title: "9. Termination",
    body: `We may terminate or suspend your account at any time, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Platform will immediately cease. You may also delete your own account at any time through the app settings.`,
  },
  {
    title: "10. Disclaimer of Warranties",
    body: `The Platform is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or secure. Your use of the Platform is at your sole risk.`,
  },
  {
    title: "11. Limitation of Liability",
    body: `To the maximum extent permitted by law, AfuChat shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the Platform.`,
  },
  {
    title: "12. Governing Law",
    body: `These Terms shall be governed by and construed in accordance with the laws of the Republic of Uganda, without regard to its conflict of law provisions.`,
  },
  {
    title: "13. Contact Us",
    body: `If you have any questions about these Terms, please contact us at:\n\nEmail: support@afuchat.com\nWebsite: https://afuchat.com`,
  },
];

export default function TermsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
          <Ionicons name={Platform.OS === "web" ? "arrow-back" : "close"} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Terms of Service</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Terms of Service</Text>
        <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated: {LAST_UPDATED}</Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Welcome to AfuChat. Please read these Terms of Service carefully before using our platform.
        </Text>

        {sections.map((section, i) => (
          <View key={i} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  content: { paddingHorizontal: 20, paddingTop: 24, gap: 4 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  updated: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  intro: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  sectionBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
