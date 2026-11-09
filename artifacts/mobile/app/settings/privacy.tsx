import React from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import { useLanguage } from "@/context/LanguageContext";

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { t } = useLanguage();
  return (
    <View style={s.section}>
      <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{t(title)}</Text>
      <View style={[s.card, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({
  icon,
  iconColor,
  label,
  sublabel,
  last,
  danger,
  onPress,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  label: string;
  sublabel?: string;
  last?: boolean;
  danger?: boolean;
  onPress?: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const { t } = useLanguage();
  return (
    <>
      <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
        <View style={s.iconWrap}>
          <Ionicons name={icon} size={22} color={danger ? "#FF3B30" : colors.text} />
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowLabel, { color: danger ? "#FF3B30" : colors.text }]}>{t(label)}</Text>
          {sublabel && (
            <Text style={[s.rowSub, { color: colors.textMuted }]} numberOfLines={2}>
              {t(sublabel)}
            </Text>
          )}
        </View>
        <Ionicons
          name="chevron-forward"
          size={15}
          color={danger ? "#FF3B3088" : colors.textMuted}
          style={{ marginLeft: 2 }}
        />
      </TouchableOpacity>
      {!last && <View style={[s.divider, { backgroundColor: colors.separator }]} />}
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PrivacySettingsScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { features: adv, setFeature } = useAdvancedFeatures();
  const { t } = useLanguage();

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Privacy" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 48 }]}
      >
        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <Section title="privacy.account" colors={colors}>
          <Row
            icon="lock-closed"
            iconColor="#0A84FF"
            label="privacy.account_privacy"
            sublabel="privacy.account_privacy_description"
            onPress={() => router.push("/settings/privacy-account" as any)}
            colors={colors}
          />
          <Row
            icon="eye-off"
            iconColor="#AF52DE"
            label="privacy.visibility"
            sublabel="privacy.visibility_description"
            onPress={() => router.push("/settings/privacy-visibility" as any)}
            last
            colors={colors}
          />
        </Section>

        {/* ── INTERACTIONS ─────────────────────────────────────────────── */}
        <Section title="privacy.interactions" colors={colors}>
          <Row
            icon="chatbubble-ellipses"
            iconColor="#30D158"
            label="privacy.messages"
            sublabel="privacy.messages_description"
            onPress={() => router.push("/settings/privacy-messages" as any)}
            colors={colors}
          />
          <Row
            icon="heart"
            iconColor="#FF2D55"
            label="privacy.reactions"
            sublabel="privacy.reactions_description"
            onPress={() => router.push("/settings/privacy-interactions" as any)}
            last
            colors={colors}
          />
        </Section>

        {/* ── SAFETY ───────────────────────────────────────────────────── */}
        <Section title="SAFETY" colors={colors}>
          <Row
            icon="ban"
            iconColor="#FF3B30"
            label="Blocked Users"
            sublabel="Manage accounts you have blocked"
            danger
            onPress={() => router.push("/settings/blocked")}
            colors={colors}
          />
          <Row
            icon="flag"
            iconColor="#FF9500"
            label="Restricted Accounts"
            sublabel="Limit interactions without blocking"
            onPress={() => router.push("/settings/privacy-restricted" as any)}
            last
            colors={colors}
          />
        </Section>

        {/* ── DATA ─────────────────────────────────────────────────────── */}
        <Section title="privacy.data" colors={colors}>
          <Row
            icon="analytics"
            iconColor="#0A84FF"
            label="privacy.data_usage"
            sublabel="privacy.personalization_description"
            onPress={() => router.push("/settings/privacy-data" as any)}
            last
            colors={colors}
          />
        </Section>

        {/* ── MESSAGING PRIVACY ────────────────────────────────────────── */}
        <Section title="MESSAGING PRIVACY" colors={colors}>
          <View style={s.toggleRow}>
            <View style={s.iconWrap}>
              <Ionicons name="chatbox-ellipses-outline" size={22} color={colors.text} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>{t("Auto-Reply")}</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>
                {t("Automatically reply when you're away or in focus mode")}
              </Text>
            </View>
            <Switch
              value={adv.auto_reply_enabled}
              onValueChange={(v) => setFeature("auto_reply_enabled", v)}
              trackColor={{ true: accent, false: colors.separator }}
              thumbColor="#fff"
            />
          </View>
          <View style={[s.divider, { backgroundColor: colors.separator }]} />
          <View style={s.toggleRow}>
            <View style={s.iconWrap}>
              <Ionicons name="timer-outline" size={22} color={colors.text} />
            </View>
            <View style={s.rowText}>
              <Text style={[s.rowLabel, { color: colors.text }]}>{t("Temporary Chats")}</Text>
              <Text style={[s.rowSub, { color: colors.textMuted }]}>
                {t("Start chats that auto-delete after a set time (disappearing messages)")}
              </Text>
            </View>
            <Switch
              value={adv.temp_chat_enabled}
              onValueChange={(v) => setFeature("temp_chat_enabled", v)}
              trackColor={{ true: accent, false: colors.separator }}
              thumbColor="#fff"
            />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 0 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },

  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  divider: { height: 0.5, marginHorizontal: 16 },
});
