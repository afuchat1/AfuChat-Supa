import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import {
  DesktopButton,
  DesktopPageHeader,
  DesktopPanel,
  DesktopSectionShell,
  useDesktopTheme,
  useHover,
} from "./ui";

const BRAND = "#00BCD4";

type SettingsTab = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
};

const TABS: SettingsTab[] = [
  { id: "account",       label: "Account",          icon: "person-outline" },
  { id: "privacy",       label: "Privacy",          icon: "shield-outline" },
  { id: "security",      label: "Security",         icon: "lock-closed-outline" },
  { id: "notifications", label: "Notifications",    icon: "notifications-outline" },
  { id: "chats",         label: "Chats",            icon: "chatbubble-outline" },
  { id: "appearance",    label: "Appearance",       icon: "contrast-outline" },
  { id: "language",      label: "Language",         icon: "language-outline" },
  { id: "advanced",      label: "Advanced",         icon: "flask-outline" },
  { id: "about",         label: "About",            icon: "information-circle-outline" },
  { id: "danger",        label: "Danger Zone",      icon: "warning-outline", color: "#FF3B30" },
];

const TAB_DESC: Record<string, { title: string; subtitle?: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  account:       { title: "Account",          subtitle: "Manage your identity and monetization",   icon: "person-outline" },
  privacy:       { title: "Privacy",          subtitle: "Control who can see and reach you",       icon: "shield-outline" },
  security:      { title: "Security",         subtitle: "Keep your account safe",                  icon: "lock-closed-outline" },
  notifications: { title: "Notifications",    subtitle: "Choose what reaches your inbox",          icon: "notifications-outline" },
  chats:         { title: "Chats",            subtitle: "Receipts, media, and backups",            icon: "chatbubble-outline" },
  appearance:    { title: "Appearance",       subtitle: "Theme and colors",                        icon: "contrast-outline" },
  language:      { title: "Language",         subtitle: "Pick the language for AfuChat",           icon: "language-outline" },
  advanced:      { title: "Advanced",         subtitle: "Experimental features and customization", icon: "flask-outline" },
  about:         { title: "About",            subtitle: "Legal, support, and version info",        icon: "information-circle-outline" },
  danger:        { title: "Danger Zone",      subtitle: "Irreversible account actions",            icon: "warning-outline" },
};

/* ─── Setting row & helpers ─────────────────────────────────────────────── */

function SettingRow({
  icon,
  label,
  sub,
  onPress,
  right,
  iconColor,
  isLast,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  iconColor?: string;
  isLast?: boolean;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  const inner = (
    <View
      style={[
        styles.row,
        {
          backgroundColor: hovered && onPress ? t.rowHover : "transparent",
          borderBottomColor: t.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      {...(hp as any)}
    >
      <View style={[styles.rowIcon, { backgroundColor: (iconColor ?? t.accent) + "1A" }]}>
        <Ionicons name={icon} size={15} color={iconColor ?? t.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowLabel, { color: t.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: t.textMuted }]}>{sub}</Text> : null}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={15} color={t.textMuted} />)}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>{inner}</TouchableOpacity>
  ) : (
    inner
  );
}

function GroupHeader({ title }: { title: string }) {
  const t = useDesktopTheme();
  return (
    <Text
      style={{
        fontFamily: "Inter_600SemiBold",
        fontSize: 11,
        letterSpacing: 0.7,
        color: t.textMuted,
        textTransform: "uppercase",
        marginTop: 18,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <DesktopPanel>{children}</DesktopPanel>;
}

/* ─── Tabs ─────────────────────────────────────────────────────────────── */

function AccountTab({ profile }: { profile: any }) {
  const t = useDesktopTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      {/* Profile card */}
      <DesktopPanel>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 18, gap: 14 }}>
          <Avatar
            uri={profile?.avatar_url ?? null}
            name={profile?.display_name || "?"}
            size={64}
            style={{ borderRadius: 14 }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 17, color: t.text, letterSpacing: -0.2 }}>
              {profile?.display_name || "User"}
            </Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: t.textMuted, marginTop: 2 }}>
              @{profile?.handle || "user"}
            </Text>
            {!!profile?.bio && (
              <Text
                style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: t.textSub ?? t.text, marginTop: 6, lineHeight: 18 }}
                numberOfLines={2}
              >
                {profile.bio}
              </Text>
            )}
          </View>
          <DesktopButton
            label="Edit profile"
            icon="create-outline"
            variant="secondary"
            onPress={() => router.push("/profile/edit" as any)}
          />
        </View>
      </DesktopPanel>

      <GroupHeader title="Account" />
      <Group>
        <SettingRow icon="mail-outline"     label="Email Address" sub={profile?.email || "Not set"} />
        <SettingRow icon="call-outline"     label="Phone Number"  sub="Tap to add or change" onPress={() => {}} />
        <SettingRow icon="at-outline"       label="Username"      sub={`@${profile?.handle || "user"}`} onPress={() => router.push("/username-market" as any)} />
        <SettingRow icon="id-card-outline"  label="Digital ID"    sub="View your digital identity card" onPress={() => router.push("/digital-id" as any)} isLast />
      </Group>

      <GroupHeader title="Linked accounts" />
      <Group>
        <SettingRow icon="logo-google" label="Google" sub="Connect Google account" onPress={() => router.push("/linked-accounts" as any)} isLast />
      </Group>

      <GroupHeader title="Monetization" />
      <Group>
        <SettingRow icon="star-outline"     label="Premium"          sub="Upgrade to Premium" onPress={() => router.push("/premium" as any)} iconColor="#D4A853" />
        <SettingRow icon="ribbon-outline"   label="Prestige"         sub="View your prestige level" onPress={() => router.push("/prestige" as any)} iconColor="#AF52DE" />
        <SettingRow icon="cash-outline"     label="Monetize"         sub="Earn from your content" onPress={() => router.push("/monetize" as any)} iconColor="#34C759" />
        <SettingRow icon="people-outline"   label="Referral Program" sub="Invite friends and earn rewards" onPress={() => router.push("/referral" as any)} iconColor="#00C781" isLast />
      </Group>
    </ScrollView>
  );
}

function PrivacyTab() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="Privacy" />
      <Group>
        <SettingRow icon="eye-outline"           label="Account Visibility"   onPress={() => router.push("/settings/privacy-visibility" as any)} />
        <SettingRow icon="person-outline"        label="Profile Information"  onPress={() => router.push("/settings/privacy-account" as any)} />
        <SettingRow icon="chatbubble-outline"    label="Messages"             onPress={() => router.push("/settings/privacy-messages" as any)} />
        <SettingRow icon="hand-left-outline"     label="Interactions"         onPress={() => router.push("/settings/privacy-interactions" as any)} />
        <SettingRow icon="people-circle-outline" label="Restricted Accounts"  onPress={() => router.push("/settings/privacy-restricted" as any)} />
        <SettingRow icon="ban-outline"           label="Blocked Accounts"     onPress={() => router.push("/settings/blocked" as any)} iconColor="#FF3B30" isLast />
      </Group>
      <GroupHeader title="Data" />
      <Group>
        <SettingRow icon="download-outline" label="Download Your Data" onPress={() => router.push("/settings/privacy-download" as any)} />
        <SettingRow icon="server-outline"   label="Data Usage"         onPress={() => router.push("/settings/privacy-data" as any)} isLast />
      </Group>
    </ScrollView>
  );
}

function SecurityTab() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="Security" />
      <Group>
        <SettingRow icon="lock-closed-outline"      label="Change Password"  onPress={() => router.push("/settings/security" as any)} />
        <SettingRow icon="shield-checkmark-outline" label="Two-Factor Auth"  onPress={() => router.push("/settings/security" as any)} />
        <SettingRow icon="phone-portrait-outline"   label="Device Security"  onPress={() => router.push("/device-security" as any)} isLast />
      </Group>
      <GroupHeader title="Sessions" />
      <Group>
        <SettingRow icon="desktop-outline" label="Active Sessions" sub="Manage logged-in devices" onPress={() => {}} isLast />
      </Group>
    </ScrollView>
  );
}

function NotificationsTab() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="Notifications" />
      <Group>
        <SettingRow icon="notifications-outline" label="Push Notifications"  onPress={() => router.push("/settings/notifications" as any)} />
        <SettingRow icon="mail-outline"          label="Email Notifications" onPress={() => router.push("/settings/notifications" as any)} />
        <SettingRow icon="megaphone-outline"     label="Mentions & Tags"     onPress={() => router.push("/settings/notifications" as any)} isLast />
      </Group>
    </ScrollView>
  );
}

function ChatsTab() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="Chat preferences" />
      <Group>
        <SettingRow icon="eye-outline"          label="Read Receipts"       onPress={() => router.push("/settings/chat" as any)} />
        <SettingRow icon="cloud-upload-outline" label="Media Auto-download" onPress={() => router.push("/settings/chat" as any)} />
        <SettingRow icon="archive-outline"      label="Chat Backup"         onPress={() => router.push("/settings/chat" as any)} isLast />
      </Group>
    </ScrollView>
  );
}

function AppearanceTab({ themeMode, setMode }: { themeMode: string; setMode: (m: any) => void }) {
  const t = useDesktopTheme();
  const themes = [
    { key: "system", label: "System", icon: "contrast-outline" as const, sub: "Match your device theme" },
    { key: "light",  label: "Light",  icon: "sunny-outline"    as const, sub: "Always use light theme" },
    { key: "dark",   label: "Dark",   icon: "moon-outline"     as const, sub: "Always use dark theme" },
  ];
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="Theme" />
      <Group>
        {themes.map((th, i) => (
          <SettingRow
            key={th.key}
            icon={th.icon}
            label={th.label}
            sub={th.sub}
            onPress={() => setMode(th.key)}
            right={
              themeMode === th.key ? <Ionicons name="checkmark-circle" size={20} color={t.accent} /> : null
            }
            isLast={i === themes.length - 1}
          />
        ))}
      </Group>
      <GroupHeader title="Personalization" />
      <Group>
        <SettingRow
          icon="color-palette-outline"
          label="Accent Color"
          sub="Open in Advanced features"
          onPress={() => router.push("/advanced-features" as any)}
          isLast
        />
      </Group>
    </ScrollView>
  );
}

function AboutTab() {
  const t = useDesktopTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <GroupHeader title="App" />
      <Group>
        <SettingRow icon="information-circle-outline" label="About AfuChat"     onPress={() => router.push("/about" as any)} />
        <SettingRow icon="document-text-outline"      label="Terms of Service"  onPress={() => router.push("/terms" as any)} />
        <SettingRow icon="shield-outline"             label="Privacy Policy"    onPress={() => router.push("/privacy" as any)} />
        <SettingRow icon="headset-outline"            label="Support"           onPress={() => router.push("/support" as any)} isLast />
      </Group>
      <View style={{ marginTop: 24, alignItems: "center" }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: t.accent + "1A",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="logo-react" size={26} color={t.accent} />
        </View>
        <Text style={{ marginTop: 10, fontFamily: "Inter_700Bold", fontSize: 16, color: t.text }}>AfuChat</Text>
        <Text style={{ marginTop: 4, fontFamily: "Inter_400Regular", fontSize: 12, color: t.textMuted }}>Version 2.0</Text>
      </View>
    </ScrollView>
  );
}

function DangerTab({ signOut }: { signOut: () => void }) {
  const t = useDesktopTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.danger + "55",
          backgroundColor: t.danger + "12",
        }}
      >
        <Ionicons name="warning" size={20} color={t.danger} />
        <Text style={{ flex: 1, color: t.danger, fontFamily: "Inter_500Medium", fontSize: 13.5, lineHeight: 19 }}>
          Actions in this section are irreversible. Proceed with caution.
        </Text>
      </View>
      <GroupHeader title="Session" />
      <Group>
        <SettingRow icon="log-out-outline" label="Sign Out" sub="Sign out of your account" onPress={signOut} iconColor="#FF3B30" isLast />
      </Group>
      <GroupHeader title="Account" />
      <Group>
        <SettingRow icon="trash-outline" label="Delete Account" sub="Permanently delete your account and all data" onPress={() => {}} iconColor="#FF3B30" isLast />
      </Group>
    </ScrollView>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export function DesktopSettingsSection() {
  const { themeMode, setThemeMode } = useTheme();
  const t = useDesktopTheme();
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("account");

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/login");
  }

  function renderContent() {
    switch (activeTab) {
      case "account":       return <AccountTab profile={profile} />;
      case "privacy":       return <PrivacyTab />;
      case "security":      return <SecurityTab />;
      case "notifications": return <NotificationsTab />;
      case "chats":         return <ChatsTab />;
      case "appearance":    return <AppearanceTab themeMode={themeMode} setMode={setThemeMode} />;
      case "language":      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody}>
          <GroupHeader title="Language" />
          <Group>
            <SettingRow icon="language-outline" label="App Language" sub="English" onPress={() => router.push("/language-settings" as any)} isLast />
          </Group>
        </ScrollView>
      );
      case "advanced":      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.tabBody}>
          <GroupHeader title="Advanced" />
          <Group>
            <SettingRow icon="flask-outline" label="Advanced Features" sub="Manage beta features and customization" onPress={() => router.push("/advanced-features" as any)} isLast />
          </Group>
        </ScrollView>
      );
      case "about":         return <AboutTab />;
      case "danger":        return <DangerTab signOut={handleSignOut} />;
      default:              return null;
    }
  }

  const desc = TAB_DESC[activeTab] ?? TAB_DESC.account;

  return (
    <DesktopSectionShell padded={false} style={{ flexDirection: "row" }}>
      {/* Left rail */}
      <View
        style={[
          styles.sidebar,
          { backgroundColor: t.panelBg, borderRightColor: t.border },
        ]}
      >
        <Text style={[styles.sidebarTitle, { color: t.text }]}>Settings</Text>
        <View style={Platform.OS === "web" ? ({ overflowY: "auto", flex: 1 } as any) : { flex: 1 }}>
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            const tColor = tab.color ?? t.accent;
            return (
              <SidebarTab
                key={tab.id}
                tab={tab}
                isActive={isActive}
                tintColor={tColor}
                onPress={() => setActiveTab(tab.id)}
              />
            );
          })}
        </View>
      </View>

      {/* Content */}
      <View style={{ flex: 1, padding: 18, ...(Platform.OS === "web" ? ({ overflow: "auto" } as any) : {}) }}>
        <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", flex: 1 }}>
          <DesktopPanel flex={1}>
            <DesktopPageHeader title={desc.title} subtitle={desc.subtitle} icon={desc.icon} />
            <View style={{ flex: 1 }}>{renderContent()}</View>
          </DesktopPanel>
        </View>
      </View>
    </DesktopSectionShell>
  );
}

function SidebarTab({
  tab,
  isActive,
  tintColor,
  onPress,
}: {
  tab: SettingsTab;
  isActive: boolean;
  tintColor: string;
  onPress: () => void;
}) {
  const t = useDesktopTheme();
  const [hovered, hp] = useHover();
  const bg = isActive ? tintColor + "16" : hovered ? t.rowHover : "transparent";
  const fg = isActive ? tintColor : t.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.sideTab, { backgroundColor: bg }]}
      {...(hp as any)}
    >
      {isActive && <View style={[styles.sideTabBar, { backgroundColor: tintColor }]} />}
      <Ionicons name={tab.icon} size={15} color={fg} />
      <Text
        style={{
          color: fg,
          fontSize: 13.5,
          fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium",
        }}
      >
        {tab.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create<any>({
  sidebar: {
    width: 220,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingHorizontal: 10,
    flexShrink: 0,
    flexDirection: "column",
  },
  sidebarTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    marginBottom: 12,
    paddingHorizontal: 10,
  },
  sideTab: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    marginBottom: 2,
  },
  sideTabBar: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 2.5,
    borderRadius: 2,
  },
  tabBody: { padding: 18, gap: 0, paddingBottom: 32 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 13.5, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
