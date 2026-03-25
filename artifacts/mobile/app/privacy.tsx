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
    title: "1. Information We Collect",
    body: `We collect information you provide directly to us, including:\n\n• Account information: email address, display name, username (handle), password, date of birth, gender, and country\n• Profile information: avatar, banner image, bio, phone number, website URL, and interests\n• Content you create: posts, messages, stories, comments, and media uploads\n• Communications: messages you send and receive through the Platform\n• Usage data: interactions with content, features used, and preferences\n• Device information: device type, operating system, and push notification tokens`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use the information we collect to:\n\n• Provide, maintain, and improve the Platform\n• Create and manage your account\n• Enable communication between users\n• Personalize your experience and deliver relevant content\n• Send you notifications about activity on your account\n• Detect, prevent, and address fraud, abuse, and security issues\n• Comply with legal obligations\n• Analyze usage patterns to improve the Platform`,
  },
  {
    title: "3. Information Sharing",
    body: `We do not sell your personal information. We may share your information in the following circumstances:\n\n• With other users: Your profile information, posts, and public content are visible to other users as part of the Platform's social features\n• With service providers: We use third-party services (such as Supabase for data storage, Expo for app delivery) that process data on our behalf\n• For legal reasons: We may disclose information if required by law, regulation, or legal process\n• For safety: To protect the rights, property, or safety of AfuChat, our users, or the public`,
  },
  {
    title: "4. Data Storage and Security",
    body: `Your data is stored securely using industry-standard practices. We use Supabase as our backend infrastructure, which provides encryption at rest and in transit. While we implement reasonable security measures, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security of your data.`,
  },
  {
    title: "5. Your Rights and Choices",
    body: `You have the following rights regarding your personal data:\n\n• Access: You can view your profile and account information at any time\n• Update: You can edit your profile, preferences, and settings\n• Delete: You can request account deletion through the app settings, which will schedule your account and associated data for permanent deletion\n• Data portability: You may request a copy of your data\n• Opt-out: You can disable push notifications and adjust privacy settings (private account, online status visibility)\n• Blocking: You can block users to prevent them from seeing your content or contacting you`,
  },
  {
    title: "6. Cookies and Tracking",
    body: `On the web version of AfuChat, we use local storage and session cookies to maintain your login state and preferences. We do not use third-party advertising cookies or cross-site tracking technologies. Analytics data is collected in aggregate form to improve the Platform.`,
  },
  {
    title: "7. Children's Privacy",
    body: `AfuChat is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will promptly delete that information. If you believe a child under 13 may have provided us with personal data, please contact us.`,
  },
  {
    title: "8. International Data Transfers",
    body: `Your information may be transferred to, stored, and processed in countries other than your country of residence. By using the Platform, you consent to the transfer of your information to countries that may have different data protection laws than your country.`,
  },
  {
    title: "9. Data Retention",
    body: `We retain your personal information for as long as your account is active or as needed to provide services. When you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required to retain it for legal, regulatory, or legitimate business purposes.`,
  },
  {
    title: "10. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on the Platform and updating the "Last updated" date. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.`,
  },
  {
    title: "11. Contact Us",
    body: `If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:\n\nEmail: support@afuchat.com\nWebsite: https://afuchat.com`,
  },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
          <Ionicons name={Platform.OS === "web" ? "arrow-back" : "close"} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={[styles.pageTitle, { color: colors.text }]}>Privacy Policy</Text>
        <Text style={[styles.updated, { color: colors.textMuted }]}>Last updated: {LAST_UPDATED}</Text>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          At AfuChat, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
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
