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
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { Avatar } from "@/components/ui/Avatar";
import { AfuLogo } from "@/components/ui/AfuLogo";
import Colors from "@/constants/colors";
import { openAppReview } from "@/lib/appReview";
import { requestNativeWidgetPin } from "@/lib/nativeShareShortcuts";

// ─── Theme toggle options ──────────────────────────────────────────────────────
// ─── Reusable row primitives ───────────────────────────────────────────────────
function Section({
  title,
  children,
  colors,
}: {
  title?: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { t } = useLanguage();
  return (
    <View style={s.section}>
        {title && (
          <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{t(title)}</Text>
        )}
      <View style={[s.card, { backgroundColor: colors.card }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  sublabel,
  value,
  badge,
  onPress,
  last,
  colors,
  accent,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBg?: string;
  label: string;
  sublabel?: string;
  value?: string;
  badge?: string;
  onPress?: () => void;
  last?: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  accent: string;
  danger?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <>
      <TouchableOpacity
        style={s.row}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress}
      >
        <View style={s.iconWrap}>
          <Ionicons name={icon} size={22} color={danger ? "#FF3B30" : colors.text} />
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowLabel, { color: colors.text }]}>{t(label)}</Text>
          {sublabel && (
            <Text style={[s.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
              {t(sublabel)}
            </Text>
          )}
        </View>
        {value && (
          <Text style={[s.rowValue, { color: colors.textMuted }]}>{value}</Text>
        )}
        {badge && (
          <View style={[s.badge, { backgroundColor: accent + "22" }]}>
            <Text style={[s.badgeText, { color: accent }]}>{t(badge)}</Text>
          </View>
        )}
        {onPress && (
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      {!last && <View style={[s.divider, { backgroundColor: colors.separator }]} />}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { colors, accent, isDark, themeMode, setThemeMode } = useTheme();
  const { langLabel, t } = useLanguage();
  const { user, profile, isPremium } = useAuth();
  const insets = useSafeAreaInsets();

  const BRAND = Colors.brand;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title={t("Settings")} />

      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Profile card ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.profileCard, { backgroundColor: colors.card }]}
          onPress={() => router.push("/profile/edit")}
          activeOpacity={0.8}
        >
          <Avatar
            uri={profile?.avatar_url}
            name={profile?.display_name}
            size={58}
          />
          <View style={s.profileInfo}>
            <View style={s.profileNameRow}>
              <Text style={[s.profileName, { color: colors.text }]} numberOfLines={1}>
                {profile?.display_name ?? "Your Name"}
              </Text>
              {isPremium && (
                <View style={[s.premiumPill, { backgroundColor: BRAND + "20" }]}>
                  <Ionicons name="star" size={10} color={BRAND} />
                  <Text style={[s.premiumText, { color: BRAND }]}>Premium</Text>
                </View>
              )}
            </View>
            <Text style={[s.profileHandle, { color: colors.textMuted }]} numberOfLines={1}>
              @{profile?.handle ?? "handle"}
            </Text>
            {user?.email && (
              <Text style={[s.profileEmail, { color: colors.textMuted }]} numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ── Appearance ────────────────────────────────────────────────── */}
        <Section title={t("APPEARANCE")} colors={colors}>
          <View style={s.themeRow}>
            {([
              { key: "system", label: t("System"), icon: "phone-portrait-outline" },
              { key: "light", label: t("Light"), icon: "sunny-outline" },
              { key: "dark", label: t("Dark"), icon: "moon-outline" },
            ] as const).map((option) => {
              const active = themeMode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setThemeMode(option.key)}
                  style={[
                    s.themeBtn,
                    { borderColor: active ? accent : colors.border },
                    active && { backgroundColor: accent + "18" },
                  ]}
                  activeOpacity={0.75}
                >
                  <Ionicons name={option.icon} size={16} color={active ? accent : colors.textMuted} />
                  <Text style={[s.themeBtnText, { color: active ? accent : colors.textMuted }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[s.appearanceNote, { color: colors.textMuted }]}>
            {t("settings.appearance_note")}
          </Text>
          <View style={[s.divider, { backgroundColor: colors.separator }]} />
          <Row
            icon="language"
            label="Language"
            value={langLabel}
            onPress={() => router.push("/language-settings")}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {Platform.OS === "android" && (
          <Section title="settings.home_screen" colors={colors}>
            <Row
              icon="grid-outline"
              label="settings.add_widget"
              sublabel="settings.widget_description"
              onPress={async () => {
                const pinned = await requestNativeWidgetPin();
                if (!pinned) {
                  showAlert(
                    t("settings.widget_help_title"),
                    t("settings.widget_help_body"),
                  );
                }
              }}
              last
              colors={colors}
              accent={accent}
            />
          </Section>
        )}

        {/* ── Messaging ─────────────────────────────────────────────────── */}
        <Section title="MESSAGING" colors={colors}>
          <Row
            icon="chatbubble-ellipses"
            label="settings.chat_settings"
            sublabel="settings.chat_settings_description"
            onPress={() => router.push("/settings/chat")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="person-remove"
            label="settings.blocked_users"
            sublabel="settings.blocked_users_description"
            onPress={() => router.push("/settings/blocked")}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Privacy & Security ────────────────────────────────────────── */}
        <Section title="settings.privacy_security" colors={colors}>
          <Row
            icon="eye-off"
            label="Privacy"
            sublabel="settings.privacy_description"
            onPress={() => router.push("/settings/privacy")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="lock-closed"
            label="settings.security_password"
            sublabel="settings.security_description"
            onPress={() => router.push("/settings/security")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="key"
            label="settings.login_methods"
            sublabel="settings.login_methods_description"
            onPress={() => router.push("/settings/oauth-providers")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="cloud-download"
            label="settings.download_data"
            sublabel="settings.download_data_description"
            onPress={() => router.push("/settings/privacy-download" as any)}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Content & Cache ───────────────────────────────────────────── */}
        <Section title="settings.content_cache" colors={colors}>
          {(
            <Row
              icon="download"
              label="settings.offline_videos"
              sublabel="settings.offline_videos_description"
              onPress={() => router.push("/settings/offline-videos" as any)}
              colors={colors}
              accent={accent}
            />
          )}
          {(
            <Row
              icon="eye-off"
              label="settings.not_interested"
              sublabel="settings.not_interested_description"
              onPress={() => router.push("/settings/not-interested" as any)}
              last
              colors={colors}
              accent={accent}
            />
          )}
        </Section>

        {/* ── Support & About ───────────────────────────────────────────── */}
        <Section title="settings.support_about" colors={colors}>
          <Row
            icon="help-buoy"
            label="settings.help_support"
            sublabel="settings.help_support_description"
            onPress={() => router.push("/support" as any)}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="star"
            label="settings.rate_afuchat"
            sublabel="settings.rate_afuchat_description"
            onPress={() => { openAppReview().catch(() => showAlert(t("Unable to open Google Play"), t("Please try again later."))); }}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="information-circle"
            label="settings.about_afuchat"
            sublabel="settings.about_afuchat_description"
            onPress={() => router.push("/about" as any)}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Brand footer ──────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.footerBrand}>
            <AfuLogo size={24} />
            <Text style={[s.footerAfu,  { color: colors.textMuted }]}>Afu</Text>
            <Text style={[s.footerChat, { color: BRAND }]}>Chat</Text>
          </View>
          <Text style={[s.footerTagline, { color: colors.textMuted }]}>
            {t("settings.footer_tagline")}
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 0 },

  overlay: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  overlayCard: {
    borderRadius: 24, padding: 32, alignItems: "center", gap: 14, minWidth: 240,
  },
  overlayTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  overlaySub:   { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  premiumPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  premiumText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileEmail:  { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Section container
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },

  // Generic row
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  divider: { height: 0.5, marginHorizontal: 16 },

  // Theme toggle
  themeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  darkModeBadge: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, alignSelf: "flex-start" },
  appearanceNote: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular", paddingVertical: 2 },
  themeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  themeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Account rows
  accountRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  accountAvatarWrap: { position: "relative" },
  activeDot: { position: "absolute", bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  accountInfo: { flex: 1 },
  accountName:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  activePill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  activePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  switchBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16 },
  switchBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  manageAccRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  manageAccText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },

  // Footer
  footer: { alignItems: "center", paddingTop: 16, paddingBottom: 8, gap: 4 },
  footerBrand: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerAfu:  { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  footerChat: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  footerTagline: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
});
