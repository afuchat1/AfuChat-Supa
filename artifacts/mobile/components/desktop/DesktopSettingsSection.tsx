import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";

const BRAND = "#00BCD4";

type SettingsTab = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
};

const TABS: SettingsTab[] = [
  { id: "account",      label: "Account",          icon: "person-outline" },
  { id: "privacy",      label: "Privacy",           icon: "shield-outline" },
  { id: "security",     label: "Security",          icon: "lock-closed-outline" },
  { id: "notifications",label: "Notifications",     icon: "notifications-outline" },
  { id: "chats",        label: "Chat Settings",     icon: "chatbubble-outline" },
  { id: "appearance",   label: "Appearance",        icon: "contrast-outline" },
  { id: "language",     label: "Language",          icon: "language-outline" },
  { id: "advanced",     label: "Advanced Features", icon: "flask-outline" },
  { id: "about",        label: "About",             icon: "information-circle-outline" },
  { id: "danger",       label: "Danger Zone",       icon: "warning-outline",   color: "#FF3B30" },
];

// ─── Setting rows ─────────────────────────────────────────────────────────────

function SettingRow({
  icon,
  label,
  sub,
  onPress,
  right,
  colors,
  iconColor,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  colors: any;
  iconColor?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {};

  const inner = (
    <View style={[styles.settingRow, hovered && onPress && { backgroundColor: colors.accent + "08" }]} {...(hoverProps as any)}>
      <View style={[styles.settingIconWrap, { backgroundColor: (iconColor ?? BRAND) + "16" }]}>
        <Ionicons name={icon} size={16} color={iconColor ?? BRAND} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        {sub && <Text style={[styles.settingSub, { color: colors.textMuted }]}>{sub}</Text>}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />)}
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{inner}</TouchableOpacity>
  ) : (
    inner
  );
}

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>{title.toUpperCase()}</Text>
  );
}

// ─── Tab content ─────────────────────────────────────────────────────────────

function AccountTab({ colors, profile }: { colors: any; profile: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Profile card */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Avatar uri={profile?.avatar_url ?? null} name={profile?.display_name || "?"} size={64} style={{ borderRadius: 14 }} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={[styles.profileName, { color: colors.text }]}>{profile?.display_name || "User"}</Text>
          <Text style={[styles.profileHandle, { color: colors.textMuted }]}>@{profile?.handle || "user"}</Text>
          {profile?.bio && (
            <Text style={[styles.profileBio, { color: colors.textMuted }]} numberOfLines={2}>{profile.bio}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push("/profile/edit" as any)}
          activeOpacity={0.8}
          style={[styles.editBtn, { backgroundColor: BRAND + "14", borderColor: BRAND + "30" }]}
        >
          <Ionicons name="create-outline" size={14} color={BRAND} />
          <Text style={[styles.editBtnLabel, { color: BRAND }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <SectionHeader title="Account" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="mail-outline"         label="Email Address"      sub={profile?.email || "Not set"}         colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="call-outline"          label="Phone Number"       sub="Tap to add or change"                onPress={() => {}} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="at-outline"            label="Username"           sub={`@${profile?.handle || "user"}`}     onPress={() => router.push("/username-market" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="id-card-outline"       label="Digital ID"         sub="View your digital identity card"     onPress={() => router.push("/digital-id" as any)} colors={colors} />
      </View>

      <SectionHeader title="Linked Accounts" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="logo-google"           label="Google"             sub="Connect Google account"              onPress={() => router.push("/linked-accounts" as any)} colors={colors} />
      </View>

      <SectionHeader title="Monetization" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="star-outline"          label="Premium"            sub="Upgrade to Premium"                  onPress={() => router.push("/premium" as any)} colors={colors} iconColor="#D4A853" />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="ribbon-outline"        label="Prestige"           sub="View your prestige level"            onPress={() => router.push("/prestige" as any)} colors={colors} iconColor="#AF52DE" />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="cash-outline"          label="Monetize"           sub="Earn from your content"              onPress={() => router.push("/monetize" as any)} colors={colors} iconColor="#34C759" />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="people-outline"        label="Referral Program"   sub="Invite friends and earn rewards"     onPress={() => router.push("/referral" as any)} colors={colors} iconColor="#00C781" />
      </View>
    </ScrollView>
  );
}

function PrivacyTab({ colors }: { colors: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Privacy" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="eye-outline"           label="Account Visibility"    onPress={() => router.push("/settings/privacy-visibility" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="person-outline"        label="Profile Information"   onPress={() => router.push("/settings/privacy-account" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="chatbubble-outline"    label="Messages"              onPress={() => router.push("/settings/privacy-messages" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="hand-left-outline"     label="Interactions"          onPress={() => router.push("/settings/privacy-interactions" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="people-circle-outline" label="Restricted Accounts"  onPress={() => router.push("/settings/privacy-restricted" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="ban-outline"           label="Blocked Accounts"      onPress={() => router.push("/settings/blocked" as any)} colors={colors} iconColor="#FF3B30" />
      </View>

      <SectionHeader title="Data" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="download-outline"   label="Download Your Data"     onPress={() => router.push("/settings/privacy-download" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="server-outline"     label="Data Usage"             onPress={() => router.push("/settings/privacy-data" as any)} colors={colors} />
      </View>
    </ScrollView>
  );
}

function SecurityTab({ colors }: { colors: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Security" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="lock-closed-outline"  label="Change Password"        onPress={() => router.push("/settings/security" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="shield-checkmark-outline" label="Two-Factor Auth"    onPress={() => router.push("/settings/security" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="phone-portrait-outline"   label="Device Security"   onPress={() => router.push("/device-security" as any)} colors={colors} />
      </View>

      <SectionHeader title="Sessions" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="desktop-outline"   label="Active Sessions"           sub="Manage logged-in devices"   onPress={() => {}} colors={colors} />
      </View>
    </ScrollView>
  );
}

function NotificationsTab({ colors }: { colors: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Notifications" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="notifications-outline" label="Push Notifications"  onPress={() => router.push("/settings/notifications" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="mail-outline"          label="Email Notifications" onPress={() => router.push("/settings/notifications" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="megaphone-outline"     label="Mentions & Tags"     onPress={() => router.push("/settings/notifications" as any)} colors={colors} />
      </View>
    </ScrollView>
  );
}

function ChatsTab({ colors }: { colors: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Chat Settings" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="eye-outline"         label="Read Receipts"       onPress={() => router.push("/settings/chat" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="cloud-upload-outline" label="Media Auto-download" onPress={() => router.push("/settings/chat" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="archive-outline"      label="Chat Backup"        onPress={() => router.push("/settings/chat" as any)} colors={colors} />
      </View>
    </ScrollView>
  );
}

function AppearanceTab({ colors, themeMode, cycleTheme }: { colors: any; themeMode: string; cycleTheme: () => void }) {
  const themes = [
    { key: "system", label: "System", icon: "contrast-outline" as const },
    { key: "light",  label: "Light",  icon: "sunny-outline" as const },
    { key: "dark",   label: "Dark",   icon: "moon-outline" as const },
  ];

  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="Theme" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {themes.map((t, i) => (
          <React.Fragment key={t.key}>
            {i > 0 && <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />}
            <TouchableOpacity
              onPress={cycleTheme}
              activeOpacity={0.8}
              style={styles.settingRow}
            >
              <View style={[styles.settingIconWrap, { backgroundColor: BRAND + "16" }]}>
                <Ionicons name={t.icon} size={16} color={BRAND} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text, flex: 1 }]}>{t.label}</Text>
              {themeMode === t.key && <Ionicons name="checkmark-circle" size={20} color={BRAND} />}
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>

      <SectionHeader title="Accent Color" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="color-palette-outline" label="Accent Color" sub="Open in Advanced Features" onPress={() => router.push("/advanced-features" as any)} colors={colors} />
      </View>
    </ScrollView>
  );
}

function AboutTab({ colors }: { colors: any }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <SectionHeader title="App" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="information-circle-outline" label="About AfuChat"      onPress={() => router.push("/about" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="document-text-outline"       label="Terms of Service"  onPress={() => router.push("/terms" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="shield-outline"              label="Privacy Policy"     onPress={() => router.push("/privacy" as any)} colors={colors} />
        <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
        <SettingRow icon="headset-outline"             label="Support"            onPress={() => router.push("/support" as any)} colors={colors} />
      </View>
      <View style={[styles.versionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.versionIcon, { backgroundColor: BRAND + "18" }]}>
          <Ionicons name="logo-react" size={22} color={BRAND} />
        </View>
        <Text style={[styles.versionTitle, { color: colors.text }]}>AfuChat</Text>
        <Text style={[styles.versionNum, { color: colors.textMuted }]}>Version 2.0</Text>
      </View>
    </ScrollView>
  );
}

function DangerTab({ colors, signOut }: { colors: any; signOut: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={[styles.dangerBanner, { backgroundColor: "#FF3B30" + "0d", borderColor: "#FF3B30" + "30" }]}>
        <Ionicons name="warning" size={20} color="#FF3B30" />
        <Text style={[styles.dangerBannerText, { color: "#FF3B30" }]}>
          Actions in this section are irreversible. Proceed with caution.
        </Text>
      </View>
      <SectionHeader title="Session" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="log-out-outline" label="Sign Out" sub="Sign out of your account" onPress={signOut} colors={colors} iconColor="#FF3B30" />
      </View>
      <SectionHeader title="Account" colors={colors} />
      <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SettingRow icon="trash-outline" label="Delete Account" sub="Permanently delete your account and all data" onPress={() => {}} colors={colors} iconColor="#FF3B30" />
      </View>
    </ScrollView>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DesktopSettingsSection() {
  const { colors, themeMode, setThemeMode } = useTheme();
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("account");

  function cycleTheme() {
    const next = themeMode === "system" ? "dark" : themeMode === "dark" ? "light" : "system";
    setThemeMode(next);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login");
  }

  function renderContent() {
    switch (activeTab) {
      case "account":        return <AccountTab colors={colors} profile={profile} />;
      case "privacy":        return <PrivacyTab colors={colors} />;
      case "security":       return <SecurityTab colors={colors} />;
      case "notifications":  return <NotificationsTab colors={colors} />;
      case "chats":          return <ChatsTab colors={colors} />;
      case "appearance":     return <AppearanceTab colors={colors} themeMode={themeMode} cycleTheme={cycleTheme} />;
      case "language":       return (
        <ScrollView contentContainerStyle={styles.tabContent}>
          <SectionHeader title="Language" colors={colors} />
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingRow icon="language-outline" label="App Language" sub="English" onPress={() => router.push("/language-settings" as any)} colors={colors} />
          </View>
        </ScrollView>
      );
      case "advanced":       return (
        <ScrollView contentContainerStyle={styles.tabContent}>
          <SectionHeader title="Advanced" colors={colors} />
          <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SettingRow icon="flask-outline"  label="Advanced Features" sub="Manage beta features and customization" onPress={() => router.push("/advanced-features" as any)} colors={colors} />
          </View>
        </ScrollView>
      );
      case "about":          return <AboutTab colors={colors} />;
      case "danger":         return <DangerTab colors={colors} signOut={handleSignOut} />;
      default:               return null;
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Left sidebar */}
      <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
        <Text style={[styles.sidebarTitle, { color: colors.text }]}>Settings</Text>
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          const tColor = tab.color ?? BRAND;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.8}
              style={[styles.sideTab, isActive && { backgroundColor: tColor + "14" }]}
            >
              <View style={[styles.sideTabIcon, isActive && { backgroundColor: tColor + "20" }]}>
                <Ionicons name={tab.icon} size={15} color={isActive ? tColor : colors.textMuted} />
              </View>
              <Text
                style={[
                  styles.sideTabLabel,
                  { color: isActive ? tColor : colors.text, fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create<any>({
  root: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: 220,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 20,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  sideTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
    marginBottom: 2,
  },
  sideTabIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  sideTabLabel: { fontSize: 14 },

  content: { flex: 1 },
  tabContent: { padding: 28, gap: 4 },

  sectionHeader: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.7,
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },

  group: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  groupDivider: { height: StyleSheet.hairlineWidth },

  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  settingIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: { fontSize: 14.5, fontFamily: "Inter_500Medium" },
  settingSub: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 2 },

  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  profileBio: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  editBtnLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  dangerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  dangerBannerText: { flex: 1, fontSize: 13.5, fontFamily: "Inter_500Medium", lineHeight: 20 },

  versionCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    gap: 6,
  },
  versionIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  versionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  versionNum: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
