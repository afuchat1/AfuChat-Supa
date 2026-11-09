import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

type LegalPageKind = "terms" | "privacy" | "account-deletion" | "child-safety";

type Section = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const INK = "#102033";
const MUTED = "#607086";
const BORDER = "#e5ebf2";
const SOFT_BLUE = "#edf6ff";

const PAGES: Record<
  LegalPageKind,
  {
    eyebrow: string;
    title: string;
    intro: string;
    icon: keyof typeof Ionicons.glyphMap;
    updated?: string;
    sections: Section[];
  }
> = {
  terms: {
    eyebrow: "AFUCHAT · LEGAL",
    title: "Terms of Service",
    intro:
      "These terms explain the rules for using AfuChat, including messaging, community features, calls, payments, and other services available through the platform.",
    icon: "document-text-outline",
    sections: [
      {
        title: "1. Using AfuChat",
        paragraphs: [
          "You must provide accurate information and keep your account credentials secure. You are responsible for activity that happens through your account.",
          "You may use AfuChat only if you can legally enter into these terms. If you use AfuChat for an organization, you confirm that you have authority to accept these terms for it.",
        ],
      },
      {
        title: "2. Community rules",
        paragraphs: ["You agree not to use AfuChat to:"],
        bullets: [
          "Harass, threaten, impersonate, exploit, or target another person.",
          "Send spam, scams, malware, or unsolicited commercial messages.",
          "Share content that is illegal, hateful, sexually exploitative, or intended to cause harm.",
          "Misuse another person’s personal information or access another account.",
          "Interfere with the service, bypass safety controls, or automate activity without permission.",
        ],
      },
      {
        title: "3. Your content",
        paragraphs: [
          "You keep ownership of content you create and share. You give AfuChat the limited permission needed to host, process, display, and deliver that content so the service works for you and the people you choose to share it with.",
          "Only share content that you have the right to use. You are responsible for your content and for the audiences you select.",
        ],
      },
      {
        title: "4. Payments and virtual items",
        paragraphs: [
          "Some AfuChat features may include purchases, subscriptions, virtual items, or creator support. Prices and applicable terms are shown before a purchase. Virtual items are not cash, cannot be redeemed for cash unless expressly stated, and may be subject to the rules of the store or payment provider used for the transaction.",
        ],
      },
      {
        title: "5. Safety and enforcement",
        paragraphs: [
          "We may review reports, limit features, remove content, suspend accounts, or take other action when needed to protect users, comply with law, or enforce these terms. We do not promise that every piece of content will be reviewed before it appears.",
        ],
      },
      {
        title: "6. Service availability",
        paragraphs: [
          "AfuChat is provided as available. Features may change, be interrupted, or be discontinued. To the extent permitted by law, AfuChat is not responsible for losses caused by outages, third-party services, or content shared by other users.",
        ],
      },
      {
        title: "7. Closing an account",
        paragraphs: [
          "You can request account deletion from the in-app Account Closure flow or use the instructions on our Account Deletion page. We may retain limited information where required for legal, security, fraud-prevention, or financial-record purposes.",
        ],
      },
      {
        title: "8. Changes and contact",
        paragraphs: [
          "We may update these terms as AfuChat changes. We will update the date on this page and, where appropriate, provide additional notice. Questions can be sent to support@afuchat.com.",
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "AFUCHAT · LEGAL",
    title: "Privacy Policy",
    intro:
      "This policy describes the information AfuChat collects, how it is used, and the choices available to you when you use our website or app.",
    icon: "shield-checkmark-outline",
    sections: [
      {
        title: "1. Information you provide",
        bullets: [
          "Account details such as your name, handle, email address, phone number, profile photo, and profile information.",
          "Messages, posts, stories, media, calls, reactions, and other content you choose to create or share.",
          "Information you provide to support, reports, surveys, or account-recovery requests.",
          "Purchase, subscription, or transaction details supplied by the relevant payment provider.",
        ],
      },
      {
        title: "2. Information collected when you use AfuChat",
        bullets: [
          "Device, browser, app version, approximate location, language, and diagnostic information.",
          "Usage and security events, such as sign-ins, sessions, feature interactions, and abuse-prevention signals.",
          "Location information only when you grant the relevant permission for features such as Nearby Friends.",
          "Contacts only when you choose to grant contacts access for people-discovery features.",
        ],
      },
      {
        title: "3. How we use information",
        bullets: [
          "Provide, personalize, maintain, and improve AfuChat features.",
          "Deliver messages, calls, media, and other interactions you request.",
          "Protect users, investigate abuse, prevent fraud, and keep the service secure.",
          "Process purchases, provide support, communicate service updates, and meet legal obligations.",
        ],
      },
      {
        title: "4. When information is shared",
        paragraphs: [
          "We share information with service providers that help us operate AfuChat, with payment and infrastructure providers when needed, when you choose to share content with other users, or when disclosure is required to comply with law or protect people and the service. We do not sell your personal information.",
        ],
      },
      {
        title: "5. Your choices",
        bullets: [
          "Change profile and privacy settings inside AfuChat.",
          "Control optional device permissions through your device settings.",
          "Request access to or deletion of your account using the Account Deletion page.",
          "Contact support@afuchat.com with privacy questions or requests.",
        ],
      },
      {
        title: "6. Retention and security",
        paragraphs: [
          "We retain information for as long as needed to provide the service, meet legal and accounting requirements, resolve disputes, enforce agreements, and protect users. We use administrative, technical, and organizational safeguards, but no online service can guarantee absolute security.",
        ],
      },
      {
        title: "7. Children",
        paragraphs: [
          "AfuChat is not intended for children who are not permitted to use social or communication services under the laws that apply to them. If you believe a child has provided personal information, contact support@afuchat.com.",
        ],
      },
      {
        title: "8. Updates",
        paragraphs: [
          "We may update this policy as our services or legal obligations change. The date at the top of this page shows when it was last updated.",
        ],
      },
    ],
  },
  "account-deletion": {
    eyebrow: "AFUCHAT · ACCOUNT CONTROL",
    title: "Delete your AfuChat account",
    intro:
      "You can start account deletion from the signed-in AfuChat app. This page explains the process and what happens to your information.",
    icon: "trash-outline",
    sections: [
      {
        title: "Delete from the app",
        paragraphs: [
          "Open AfuChat and go to Settings → Security → Account Closure. Follow the confirmation steps, then choose “Schedule Permanent Deletion.” You must confirm the account details and type the requested confirmation phrase before the request can be submitted.",
        ],
      },
      {
        title: "30-day recovery period",
        paragraphs: [
          "A deletion request starts a 30-day recovery period. During this period, signing back in lets you restore the account and cancel the scheduled deletion. If you do not restore it, the deletion continues after the recovery period.",
        ],
      },
      {
        title: "What is removed",
        paragraphs: [
          "We work to remove or de-identify account information and content associated with the account, including your profile and user-created content, subject to technical limitations and information we must retain for legal, security, fraud-prevention, dispute-resolution, or financial-record purposes.",
        ],
      },
      {
        title: "You cannot access your account",
        paragraphs: [
          "Email support@afuchat.com from the address associated with your account. Use the subject “Account deletion request” and include your AfuChat handle. Never send your password, authentication codes, or payment credentials by email.",
        ],
      },
      {
        title: "Need a copy of your information?",
        paragraphs: [
          "If you need information before requesting deletion, contact support@afuchat.com first. We may need to verify account ownership before responding.",
        ],
      },
    ],
  },
  "child-safety": {
    eyebrow: "AFUCHAT · TRUST & SAFETY",
    title: "Child Safety Standards",
    intro:
      "AfuChat has zero tolerance for child sexual abuse and exploitation (CSAE). These standards explain what we prohibit, how to report concerns, and how we respond to protect children.",
    icon: "shield-checkmark-outline",
    updated: "Last updated: August 25, 2026",
    sections: [
      {
        title: "Our zero-tolerance standard",
        paragraphs: [
          "AfuChat prohibits child sexual abuse and exploitation in every form. This includes child sexual abuse material (CSAM), sexualization of children, grooming, sexual solicitation of a minor, sextortion, trafficking, and any attempt to arrange or facilitate sexual abuse or exploitation.",
          "We prohibit content that depicts, promotes, requests, links to, or directs people to child sexual abuse or exploitation, whether shared publicly, privately, in profiles, messages, calls, or any other feature.",
        ],
      },
      {
        title: "Age and safety expectations",
        paragraphs: [
          "You must meet the minimum age required to use AfuChat in your country. Do not misrepresent your age, contact a minor for a sexual purpose, or use AfuChat to move a child to another service or an offline meeting.",
          "Adults must never request sexual images or sexual conversations from a minor. If you believe a child is in immediate danger, contact local emergency services first.",
        ],
      },
      {
        title: "How to report a child-safety concern",
        paragraphs: [
          "Report suspected CSAE, grooming, sexual exploitation, or an account that appears to belong to a child by emailing support@afuchat.com with the subject “Child safety report.” You can also use the report tools inside AfuChat when available.",
          "Include the profile handle or message link, a description of what happened, and relevant dates or context. Do not forward or attach suspected CSAM. Preserve the message or account link without downloading, copying, or redistributing illegal material.",
        ],
      },
      {
        title: "Our response",
        bullets: [
          "We prioritize child-safety reports for review and take action when our policies or the law require it.",
          "We may remove content, restrict features, suspend or permanently terminate accounts, and block related accounts or activity.",
          "We preserve relevant information when appropriate and cooperate with valid requests from law enforcement and child-protection authorities.",
          "We do not disclose the identity of a reporter to the reported user except where required by law.",
        ],
      },
      {
        title: "Contact",
        paragraphs: [
          "For child-safety reports and urgent trust-and-safety concerns: support@afuchat.com. For an immediate threat to a child’s safety, contact local emergency services or a child-protection authority and then notify AfuChat so we can take platform action.",
          "These standards are publicly published and may be updated as our safety practices and legal obligations develop. Last updated: August 25, 2026.",
        ],
      },
    ],
  },
};

function navigateTo(path: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(path);
    return;
  }
  Linking.openURL(`https://afuchat.com${path}`).catch(() => {});
}

function LegalSection({ section, accent }: { section: Section; accent: string }) {
  const renderParagraph = (paragraph: string) => {
    const parts = paragraph.split(/(support@afuchat\.com|hello@afuchat\.com)/g);
    return (
      <Text style={styles.paragraph}>
        {parts.map((part, index) =>
          part === "support@afuchat.com" || part === "hello@afuchat.com" ? (
            <Text
              key={`${part}-${index}`}
              style={[styles.emailLink, { color: accent }]}
              onPress={() => Linking.openURL(`mailto:${part}`).catch(() => {})}
              accessibilityRole="link"
              accessibilityLabel={`Email ${part}`}
            >
              {part}
            </Text>
          ) : (
            part
          ),
        )}
      </Text>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.paragraphs?.map((paragraph) => (
        <React.Fragment key={paragraph}>{renderParagraph(paragraph)}</React.Fragment>
      ))}
      {section.bullets && (
        <View style={styles.bulletList}>
          {section.bullets.map((bullet) => (
            <View key={bullet} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: accent }]} />
              <Text style={styles.bulletText}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function LegalPage({ kind }: { kind: LegalPageKind }) {
  const { colors } = useTheme();
  const BRAND = colors.accent;
  const page = PAGES[kind];
  const { width } = useWindowDimensions();
  const compact = width < 720;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={[styles.nav, compact && styles.navCompact]}>
          <Pressable onPress={() => navigateTo("/")} accessibilityRole="link">
            <Text style={styles.logo}>
              Afu<Text style={[styles.logoAccent, { color: BRAND }]}>Chat</Text>
            </Text>
          </Pressable>
          {!compact && (
            <View style={styles.navLinks}>
              <Pressable onPress={() => navigateTo("/terms")} accessibilityRole="link">
                <Text style={styles.navLink}>Terms</Text>
              </Pressable>
              <Pressable onPress={() => navigateTo("/privacy")} accessibilityRole="link">
                <Text style={styles.navLink}>Privacy</Text>
              </Pressable>
              <Pressable onPress={() => navigateTo("/account-deletion")} accessibilityRole="link">
                <Text style={styles.navLink}>Account deletion</Text>
              </Pressable>
              <Pressable onPress={() => navigateTo("/child-safety")} accessibilityRole="link">
                <Text style={styles.navLink}>Child safety</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroInner}>
          <View style={styles.iconCircle}>
            <Ionicons name={page.icon} size={25} color={BRAND} />
          </View>
          <Text style={styles.eyebrow}>{page.eyebrow}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>{page.title}</Text>
          <Text style={styles.intro}>{page.intro}</Text>
          <Text style={styles.updated}>{page.updated ?? "Last updated: August 14, 2026"}</Text>
        </View>
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={20} color={BRAND} />
          <Text style={styles.noticeText}>
            AfuChat’s legal pages are published for the web. Account actions and app settings remain inside the authenticated AfuChat app.
          </Text>
        </View>
        {page.sections.map((section) => (
          <LegalSection key={section.title} section={section} accent={BRAND} />
        ))}
      </View>

      <View style={styles.footer}>
           <Text style={styles.footerLogo}>
           Afu<Text style={[styles.logoAccent, { color: BRAND }]}>Chat</Text>
        </Text>
        <Text style={styles.footerText}>Connect · Discover · Create</Text>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => navigateTo("/terms")} accessibilityRole="link">
            <Text style={styles.footerLink}>Terms</Text>
          </Pressable>
          <Pressable onPress={() => navigateTo("/privacy")} accessibilityRole="link">
            <Text style={styles.footerLink}>Privacy</Text>
          </Pressable>
          <Pressable onPress={() => navigateTo("/account-deletion")} accessibilityRole="link">
            <Text style={styles.footerLink}>Account deletion</Text>
          </Pressable>
          <Pressable onPress={() => navigateTo("/child-safety")} accessibilityRole="link">
            <Text style={styles.footerLink}>Child safety standards</Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL("mailto:support@afuchat.com").catch(() => {})}
            accessibilityRole="link"
          >
            <Text style={styles.footerLink}>Contact support</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f7faff" },
  scrollContent: { minHeight: "100%" as any },
  header: {
    backgroundColor: "#07111f",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  nav: {
    width: "100%" as any,
    maxWidth: 1120,
    alignSelf: "center",
    minHeight: 76,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navCompact: { paddingHorizontal: 20, minHeight: 68 },
  logo: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.8 },
  logoAccent: {},
  navLinks: { flexDirection: "row", alignItems: "center", gap: 26 },
  navLink: { color: "rgba(255,255,255,0.68)", fontSize: 13, fontFamily: "Inter_500Medium" },
  hero: { backgroundColor: "#07111f", paddingHorizontal: 28, paddingBottom: 58 },
  heroCompact: { paddingHorizontal: 20, paddingBottom: 42 },
  heroInner: { width: "100%" as any, maxWidth: 820, alignSelf: "center", paddingTop: 42 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(31,149,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  eyebrow: {
    color: "#77bfff",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 48,
    lineHeight: 56,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1.8,
    marginBottom: 16,
  },
  titleCompact: { fontSize: 36, lineHeight: 43, letterSpacing: -1.2 },
  intro: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 17,
    lineHeight: 27,
    fontFamily: "Inter_400Regular",
    maxWidth: 720,
  },
  updated: {
    color: "rgba(255,255,255,0.42)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 22,
  },
  content: {
    width: "100%" as any,
    maxWidth: 820,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 52,
  },
  contentCompact: { paddingHorizontal: 20, paddingTop: 24 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: SOFT_BLUE,
    borderRadius: 16,
    padding: 16,
    marginBottom: 26,
  },
  noticeText: {
    flex: 1,
    color: "#35516e",
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  section: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  sectionTitle: {
    color: INK,
    fontSize: 20,
    lineHeight: 27,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.35,
    marginBottom: 12,
  },
  paragraph: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 25,
    fontFamily: "Inter_400Regular",
    marginBottom: 11,
  },
  emailLink: {
    textDecorationLine: "underline",
    fontFamily: "Inter_600SemiBold",
  },
  bulletList: { gap: 11, marginTop: 2 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 9,
  },
  bulletText: {
    flex: 1,
    color: MUTED,
    fontSize: 15,
    lineHeight: 25,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    backgroundColor: "#07111f",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
    gap: 10,
  },
  footerLogo: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  footerText: { color: "rgba(255,255,255,0.42)", fontSize: 12, fontFamily: "Inter_400Regular" },
  footerLinks: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 20, marginTop: 10 },
  footerLink: { color: "#77bfff", fontSize: 12, fontFamily: "Inter_500Medium" },
});