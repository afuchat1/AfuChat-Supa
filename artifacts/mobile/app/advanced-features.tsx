import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "@/lib/haptics";
import { useTheme } from "@/hooks/useTheme";
import { useAdvancedFeatures, type ActivityStatus } from "@/context/AdvancedFeaturesContext";
import { useChatPreferences, CHAT_THEME_COLORS, type ChatTheme } from "@/context/ChatPreferencesContext";
import { useAppAccent } from "@/context/AppAccentContext";
import { Separator } from "@/components/ui/Separator";

const THEMES: { name: ChatTheme; hex: string }[] = [
  { name: "Teal",    hex: "#00BCD4" },
  { name: "Blue",    hex: "#007AFF" },
  { name: "Purple",  hex: "#AF52DE" },
  { name: "Rose",    hex: "#FF2D55" },
  { name: "Amber",   hex: "#FF9500" },
  { name: "Emerald", hex: "#34C759" },
];

const STATUS_OPTIONS: { value: ActivityStatus; label: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { value: "online",    label: "Online",          color: "#34C759", icon: "radio-button-on" },
  { value: "busy",      label: "Busy",            color: "#FF3B30", icon: "ban-outline" },
  { value: "focus",     label: "Focus Mode",      color: "#FF9500", icon: "moon-outline" },
  { value: "last_seen", label: "Last Seen Only",  color: "#8E8E93", icon: "eye-outline" },
  { value: "offline",   label: "Appear Offline",  color: "#636366", icon: "ellipse-outline" },
];

function SectionHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

function ToggleRow({
  icon, iconBg, label, desc, value, onValueChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  label: string;
  desc?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors, accent } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={17} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {desc && <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{desc}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { Haptics.selectionAsync(); onValueChange(v); }}
        trackColor={{ true: accent, false: colors.backgroundTertiary }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function AdvancedFeaturesScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { features, loading: advLoading, setFeature } = useAdvancedFeatures();
  const { prefs, loading: prefsLoading, updatePref } = useChatPreferences();
  const { setAppTheme } = useAppAccent();
  const [saving, setSaving] = useState(false);

  const loading = advLoading || prefsLoading;
  const currentStatus = STATUS_OPTIONS.find((s) => s.value === features.activity_status) ?? STATUS_OPTIONS[0];
  const themeAccent = CHAT_THEME_COLORS[prefs.chat_theme]?.accent || accent;

  async function handleSetFeature<K extends keyof typeof features>(key: K, value: (typeof features)[K]) {
    setSaving(true);
    await setFeature(key, value);
    setSaving(false);
  }

  async function handleTypingToggle(v: boolean) {
    setSaving(true);
    await updatePref("typing_indicators", v);
    setSaving(false);
  }

  async function handleTheme(t: ChatTheme) {
    Haptics.selectionAsync();
    setSaving(true);
    await updatePref("chat_theme", t);
    setAppTheme(t);
    setSaving(false);
  }

  async function handleStatus(s: ActivityStatus) {
    Haptics.selectionAsync();
    await handleSetFeature("activity_status", s);
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backgroundSecondary, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
          <Ionicons name="chevron-back" size={26} color={accent} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Advanced Features</Text>
        <View style={styles.headerBtn}>
          {saving && <ActivityIndicator size="small" color={accent} />}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── BRANDING ───────────────────────────────── */}
        <SectionHeader title="BRANDING" />
        <Card>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: themeAccent }]}>
              <Ionicons name="color-palette" size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>App Colour</Text>
              <Text style={[styles.rowDesc, { color: colors.textMuted }]}>Changes tabs, buttons, and chat bubbles</Text>
            </View>
            <Text style={[styles.chipLabel, { color: themeAccent }]}>{prefs.chat_theme}</Text>
          </View>
          <View style={styles.colourRow}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.name}
                onPress={() => handleTheme(t.name)}
                style={[
                  styles.colourCircle,
                  { backgroundColor: t.hex },
                  prefs.chat_theme === t.name && styles.colourCircleActive,
                ]}
                activeOpacity={0.8}
              >
                {prefs.chat_theme === t.name && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* ── PRESENCE ──────────────────────────────── */}
        <SectionHeader title="PRESENCE" />
        <Card>
          <View style={[styles.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.iconWrap, { backgroundColor: currentStatus.color }]}>
              <Ionicons name={currentStatus.icon} size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Activity Status</Text>
              <Text style={[styles.rowDesc, { color: colors.textMuted }]}>What others see about your availability</Text>
            </View>
          </View>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => {
              const active = features.activity_status === s.value;
              return (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => handleStatus(s.value)}
                  style={[
                    styles.statusChip,
                    { borderColor: active ? s.color : colors.border },
                    active && { backgroundColor: s.color + "1A" },
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons name={s.icon} size={14} color={active ? s.color : colors.textMuted} />
                  <Text style={[styles.statusLabel, { color: active ? s.color : colors.textMuted }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <View style={[styles.card, { backgroundColor: colors.surface, marginTop: 10 }]}>
          <ToggleRow
            icon="moon"
            iconBg="#FF9500"
            label="Focus Mode"
            desc="Sets your status to Do Not Disturb and hides online indicator"
            value={features.focus_mode}
            onValueChange={(v) => handleSetFeature("focus_mode", v)}
          />
        </View>

        {/* ── MESSAGING ─────────────────────────────── */}
        <SectionHeader title="MESSAGING" />
        <Card>
          <ToggleRow
            icon="ellipsis-horizontal"
            iconBg="#5856D6"
            label="Typing Indicators"
            desc="Show when others are composing a message"
            value={prefs.typing_indicators}
            onValueChange={handleTypingToggle}
          />
          <Separator indent={54} />
          <ToggleRow
            icon="document-text-outline"
            iconBg="#34C759"
            label="Offline Drafts"
            desc="Save your half-typed messages and restore them when you return"
            value={features.offline_drafts}
            onValueChange={(v) => handleSetFeature("offline_drafts", v)}
          />
        </Card>

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
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, alignItems: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  body: { paddingTop: 24, paddingHorizontal: 16, gap: 0 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 24,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  chipLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  colourRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 4,
  },
  colourCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colourCircleActive: {
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
