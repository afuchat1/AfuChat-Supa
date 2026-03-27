import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { LANG_LABELS } from "@/lib/translate";
import Colors from "@/constants/colors";

const FLAG: Record<string, string> = {
  en: "🇬🇧", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷",
  ar: "🇸🇦", hi: "🇮🇳", pt: "🇧🇷", ru: "🇷🇺",
  ja: "🇯🇵", de: "🇩🇪", sw: "🇰🇪", ko: "🇰🇷",
  it: "🇮🇹", tr: "🇹🇷",
};

const LANG_LIST = Object.entries(LANG_LABELS).map(([code, name]) => ({ code, name }));

export default function LanguageSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferredLang, setPreferredLang } = useLanguage();
  const [saving, setSaving] = useState<string | null>(null);

  async function pick(lang: string | null) {
    setSaving(lang ?? "none");
    await setPreferredLang(lang);
    setSaving(null);
    router.back();
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Language</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          When a language is selected, all messages and posts across the app are automatically
          translated into that language as you browse.
        </Text>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.separator }]}
            onPress={() => pick(null)}
            activeOpacity={0.7}
          >
            <View style={[styles.flagBox, { backgroundColor: colors.background }]}>
              <Text style={styles.flagText}>🌐</Text>
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowName, { color: colors.text }]}>Original (no translation)</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]}>Show content in its original language</Text>
            </View>
            <View style={styles.rowRight}>
              {saving === "none" ? (
                <ActivityIndicator size="small" color={Colors.brand} />
              ) : !preferredLang ? (
                <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
              ) : (
                <View style={styles.unselectedDot} />
              )}
            </View>
          </TouchableOpacity>

          {LANG_LIST.map((lang, i) => {
            const isLast = i === LANG_LIST.length - 1;
            const isSelected = preferredLang === lang.code;
            const isSaving = saving === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.row, !isLast && { borderBottomColor: colors.separator, borderBottomWidth: StyleSheet.hairlineWidth }]}
                onPress={() => pick(lang.code)}
                activeOpacity={0.7}
              >
                <View style={[styles.flagBox, { backgroundColor: colors.background }]}>
                  <Text style={styles.flagText}>{FLAG[lang.code] ?? "🌐"}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: isSelected ? Colors.brand : colors.text }]}>{lang.name}</Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>{lang.code.toUpperCase()}</Text>
                </View>
                <View style={styles.rowRight}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color={Colors.brand} />
                  ) : isSelected ? (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
                  ) : (
                    <View style={styles.unselectedDot} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.footnote, { color: colors.textMuted }]}>
          Translations are powered by Google Translate. Results may vary for informal or mixed-language text.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 36 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 18,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  flagBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  flagText: { fontSize: 22 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowRight: { width: 28, alignItems: "center" },
  unselectedDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#C7C7CC",
  },
  footnote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginHorizontal: 20,
    marginTop: 14,
    lineHeight: 17,
  },
});
