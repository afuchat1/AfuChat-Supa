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
import { GlassHeader } from "@/components/ui/GlassHeader";

const LAST_UPDATED = "April 21, 2026";

const sections = [
  {
    title: "1. Information We Collect",
    body: `We collect information you provide directly to us, including:\n\n• Account information: email address, display name, username (handle), password, date of birth, gender, and country\n• Profile information: avatar, banner image, bio, phone number, website URL, and interests\n• Third-party sign-in data: when you choose to sign in with Google, GitHub, X (formerly Twitter), GitLab or Apple, we receive basic profile information from that provider — typically your name, email address, profile photo and provider user ID. We never receive or store your third-party account password.\n• Content you create: posts, stories, comments, and media uploads\n• Communications: messages you send through the Platform (note: private 1-on-1 messages are end-to-end encrypted and their content is not accessible to AfuChat)\n• Usage data: interactions with content, features used, and preferences\n• Device information: device type, operating system, and push notification tokens`,
  },
  {
    title: "1a. Third-Party Sign-In Providers",
    body: `AfuChat supports signing in or registering with the following identity providers:\n\n• Google\n• GitHub\n• X (formerly Twitter)\n• GitLab\n• Apple (on iOS)\n\nWhen you choose one of these options, you are redirected to the provider's secure login page. The provider then returns a limited set of profile information to AfuChat — usually your name, email, avatar URL and a stable user identifier — which we use to create or link your AfuChat account. We do not see, receive, or store your password for that provider.\n\nYou can revoke AfuChat's access at any time from your provider's account settings (e.g., Google Account → Security → Third-party access). Doing so will prevent future sign-ins via that provider but will not delete your AfuChat account; to delete your account, use Settings → Account → Delete Account.`,
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
    title: "5. End-to-End Encrypted Messaging",
    body: `All private one-to-one messages on AfuChat are protected with end-to-end encryption. This means:\n\n• Only you and the person you are messaging can read your private chat messages\n• AfuChat's servers store messages in encrypted form that we cannot decrypt\n• No AfuChat employee, system, automated process, or AI can read your private messages\n• AfuAi (our AI assistant) is technically and programmatically unable to access or retrieve any private chat content\n• Even if compelled, AfuChat cannot produce the plaintext of your private messages\n\nEnd-to-end encryption applies to all direct (1-on-1) conversations automatically. Group channels and public posts are not end-to-end encrypted and may be subject to content moderation.`,
  },
  {
    title: "6. AfuAi (AI Assistant) & Your Data",
    body: `AfuAi is an AI assistant built into AfuChat to help you navigate the platform. When you use AfuAi, it may access the following data to provide relevant responses:\n\n• Your public profile information (name, handle, bio, grade)\n• Your wallet balances and transaction history\n• Your posts, bookmarks, and social activity\n• Public platform data (trending posts, events, marketplace listings, channels)\n• Your follower and following connections\n\nAI Processing: AfuAi uses third-party AI language model providers to generate responses. Your prompts and the platform context described above may be sent to these providers for processing. These providers are bound by data processing agreements and do not use your data for training.\n\nConversation History: Your AfuAi conversations are stored to provide continuity within and across sessions. You can delete your AI conversation history at any time from within the AI assistant screen.\n\nAfuAi will NEVER:\n\n• Read, access, retrieve, or summarize any private chat messages\n• Bypass end-to-end encryption on your conversations\n• Make transactions or changes without your explicit confirmation\n\nAfuAi can send a message on your behalf only when you explicitly approve the action through a confirmation prompt. It cannot read or display existing chat conversations.`,
  },
  {
    title: "7. Your Rights and Choices",
    body: `You have the following rights regarding your personal data:\n\n• Access: You can view your profile and account information at any time\n• Update: You can edit your profile, preferences, and settings\n• Delete: You can request account deletion through the app settings, which will schedule your account and associated data for permanent deletion\n• Data portability: You may request a copy of your data\n• Opt-out: You can disable push notifications and adjust privacy settings (private account, online status visibility)\n• Blocking: You can block users to prevent them from seeing your content or contacting you`,
  },
  {
    title: "8. Cookies and Tracking",
    body: `On the web version of AfuChat, we use local storage and session cookies to maintain your login state and preferences. We do not use third-party advertising cookies or cross-site tracking technologies. Analytics data is collected in aggregate form to improve the Platform.`,
  },
  {
    title: "8a. Public Profiles & Search Engine Indexing",
    body: `Public profile pages (e.g. afuchat.com/@yourhandle) and public posts (e.g. afuchat.com/p/<post-id>) are accessible to anyone on the internet, including search engines such as Google, Bing and DuckDuckGo. We provide a public sitemap and structured data (Open Graph, Twitter Cards, JSON-LD) so that these pages can be discovered, previewed and indexed by third parties.\n\nInformation visible on these public pages — your display name, handle, bio, avatar, banner, follower count and the content of your public posts — may appear in search results and link previews on other services. Direct messages, drafts, AfuPay transactions, and any content from accounts marked private are excluded from public indexing and are not included in our sitemap.\n\nTo prevent indexing of your account:\n\n• Switch your account to private in Settings → Privacy → Account\n• Delete specific posts or your entire account\n• Use Google's "Remove outdated content" tool for cached pages after deletion\n\nWe also expose a robots.txt that disallows indexing of authenticated areas (login, register, settings, messages, wallet, search, AI chat, games).`,
  },
  {
    title: "9. Children's Privacy",
    body: `AfuChat is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will promptly delete that information. If you believe a child under 13 may have provided us with personal data, please contact us.`,
  },
  {
    title: "10. International Data Transfers",
    body: `Your information may be transferred to, stored, and processed in countries other than your country of residence. By using the Platform, you consent to the transfer of your information to countries that may have different data protection laws than your country.`,
  },
  {
    title: "11. Data Retention",
    body: `We retain your personal information for as long as your account is active or as needed to provide services. When you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required to retain it for legal, regulatory, or legitimate business purposes. End-to-end encrypted messages are purged when both parties delete their accounts.`,
  },
  {
    title: "12. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the updated policy on the Platform and updating the "Last updated" date. Your continued use of the Platform after changes are posted constitutes acceptance of the updated policy.`,
  },
  {
    title: "13. Contact Us",
    body: `If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:\n\nEmail: support@afuchat.com\nWebsite: https://afuchat.com`,
  },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GlassHeader title="Privacy Policy" onBack={() => router.canGoBack() ? router.back() : router.replace("/")} />

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
