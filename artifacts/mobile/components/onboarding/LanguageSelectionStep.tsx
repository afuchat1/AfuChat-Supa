import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { LANG_LABELS, BUNDLED_UI_LANGUAGES } from "@/lib/i18n";
import AfuLogo from "@/components/ui/AfuLogo";
import OnboardingBackdrop, { ONBOARDING_THEME } from "@/components/onboarding/OnboardingBackdrop";

const FLAGS: Record<string, string> = {
  en: "🇬🇧", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷", ar: "🇸🇦", sw: "🇰🇪",
  am: "🇪🇹", rw: "🇷🇼", lg: "🇺🇬",
};

const LANGUAGES = BUNDLED_UI_LANGUAGES
  .filter((code) => Boolean(FLAGS[code]))
  .map((code) => ({
    code,
    name: LANG_LABELS[code],
    flag: FLAGS[code],
  }));

function PlanetIcon() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44" accessibilityLabel="Planet">
      <Defs>
        <RadialGradient id="planetSurface" cx="28%" cy="22%" r="82%">
          <Stop offset="0%" stopColor="#8ED9FF" />
          <Stop offset="48%" stopColor="#2C91D5" />
          <Stop offset="100%" stopColor="#0B397C" />
        </RadialGradient>
        <SvgLinearGradient id="planetAtmosphere" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#C7EEFF" stopOpacity="0.92" />
          <Stop offset="48%" stopColor="#5FB9F4" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#1D5DA5" stopOpacity="0.7" />
        </SvgLinearGradient>
        <ClipPath id="planetClip">
          <Circle cx="22" cy="22" r="15.5" />
        </ClipPath>
      </Defs>

      <Ellipse
        cx="22"
        cy="22"
        rx="19"
        ry="7.5"
        fill="none"
        stroke="#8FD8FF"
        strokeOpacity="0.45"
        strokeWidth="1.2"
        transform="rotate(-18 22 22)"
      />
      <Circle cx="22" cy="22" r="17.5" fill="url(#planetAtmosphere)" opacity={0.34} />
      <Circle cx="22" cy="22" r="15.5" fill="url(#planetSurface)" />
      <G clipPath="url(#planetClip)" opacity={0.9}>
        <Path
          d="M9 16.5c2.5-1.8 4-3.2 6.2-3.3l2.1 2.1-1.6 2.2-2.8.6-1.7 2.5-2.9-.3-1.4-2.2zm10.2-6.1 3.1-2.1 3.7 1.2 1 2.7-2.5 1.2-2.6-.8-2.7.6zm5 10.1 3.5-.9 2.9 1.6-.6 2.8-2.2 1.3-1.8 3.9-2.7-.6-.9-3.1-2.6-1.6 1.1-2.5zm-12.7 4.2 3.1-.6 2.4 2.2-.9 3.2-2.8 1.2-2.2-2.2z"
          fill="#51B56C"
        />
        <Path
          d="M10 11.5c4.2-3.2 9.1-4.7 14.5-3.6-2.7.9-5 2-7.4 3.8-2.6 1.8-4.5 3.7-6.4 6.8-1.2-2-1.5-4.5-.7-7z"
          fill="#D1F3FF"
          opacity={0.28}
        />
      </G>
      <Circle cx="22" cy="22" r="15.5" fill="none" stroke="#B8E8FF" strokeOpacity="0.75" strokeWidth="0.8" />
      <Ellipse
        cx="17"
        cy="15"
        rx="5.5"
        ry="3"
        fill="#FFFFFF"
        opacity={0.2}
        transform="rotate(-28 17 15)"
      />
    </Svg>
  );
}

type LanguageSelectionStepProps = {
  onComplete: () => void;
};

export default function LanguageSelectionStep({ onComplete }: LanguageSelectionStepProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { setPreferredLang, t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(278);
  const continueLabel = selected ? t("Continue") : t("Choose a language");
  const isMobile = screenWidth < 600;
  const contentWidth = Math.max(0, Math.min(560, screenWidth - 32));
  const headerWidth = isMobile ? screenWidth : contentWidth;

  function selectLanguage(code: string) {
    setSelected(code);
    // Apply the language immediately so this screen updates as soon as the
    // user selects an option. The provider handles persistence and sync.
    void setPreferredLang(code);
  }

  async function continueSelection() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await setPreferredLang(selected);
    } catch {
      // The local preference is written before optional remote profile sync.
    } finally {
      setSaving(false);
      onComplete();
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <OnboardingBackdrop />

      <View style={styles.headerPositioner}>
        <View
          style={[
            styles.header,
            isMobile && styles.headerMobile,
            {
              width: headerWidth,
              paddingTop: insets.top + (isMobile ? 16 : 24),
              backgroundColor: colors.background,
            },
          ]}
          onLayout={(event) => {
            const measuredHeight = Math.ceil(event.nativeEvent.layout.height);
            if (measuredHeight > 0 && measuredHeight !== headerHeight) {
              setHeaderHeight(measuredHeight);
            }
          }}
        >
          <View style={styles.headerInner}>
            <View style={styles.brandLockup}>
              <View style={styles.brandIconFrame}>
                <AfuLogo size={24} forceTheme={isDark ? "dark" : "light"} />
              </View>
              <View>
                <Text style={[styles.brandText, { color: colors.text }]}>AfuChat</Text>
              </View>
            </View>

            <View style={[styles.hero, isMobile && styles.heroMobile]}>
              <View style={styles.globeBadge}>
                <PlanetIcon />
              </View>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {t("Choose your language")}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {t("Select the language you understand best. We will use it to make your AfuChat experience easier to follow.")}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.languageScrollContent,
          {
            paddingTop: headerHeight + 24,
            paddingBottom: 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.languageList, { width: contentWidth }]}>
          {LANGUAGES.map((language) => {
            const isSelected = selected === language.code;
            return (
              <Pressable
                key={language.code}
                onPress={() => selectLanguage(language.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                style={({ pressed }) => [
                  styles.languageRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  isSelected && styles.languageRowSelected,
                  pressed && styles.languageRowPressed,
                ]}
              >
                <View style={[styles.badgeBubble, { backgroundColor: colors.inputBg }, isSelected && styles.badgeBubbleSelected]}>
                  <Text style={styles.flag}>{language.flag}</Text>
                </View>
                <View style={styles.languageInfo}>
                  <Text style={[styles.languageName, { color: colors.text }, isSelected && styles.languageNameSelected]}>
                    {language.name}
                  </Text>
                </View>
                <View style={[styles.radio, isSelected && styles.radioSelected, styles.radioEdge]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomFooter,
          {
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <Pressable
          onPress={continueSelection}
          disabled={!selected || saving}
          style={({ pressed }) => [
            styles.continueButton,
            { backgroundColor: colors.accent },
            !selected && [
              styles.continueButtonDisabled,
              { backgroundColor: colors.inputBg },
            ],
            pressed && selected && styles.continueButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selected || saving }}
          accessibilityLabel={selected ? continueLabel : t("Choose a language")}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text
                style={[
                  styles.continueText,
                  !selected && { color: colors.textSecondary },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
              >
                {continueLabel}
              </Text>
              <Text
                style={[
                  styles.continueArrow,
                  !selected && { color: colors.textSecondary },
                ]}
              >
                →
              </Text>
            </>
          )}
        </Pressable>
        <Text style={[styles.requiredHint, { color: colors.textSecondary }]}>
          {selected ? t("You can change this later in Settings.") : t("Select one option to continue.")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ONBOARDING_THEME.background, overflow: "hidden" },
  scroll: { flex: 1 },
  languageScrollContent: { paddingHorizontal: 22 },
  headerPositioner: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, elevation: 10,
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 22,
    // Keep the header opaque; its rendered background follows the selected theme.
    backgroundColor: ONBOARDING_THEME.gradientTop,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000000", shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 8 },
      web: { boxShadow: "0 10px 26px rgba(0,0,0,0.24)" } as any,
    }),
  },
  headerMobile: {
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerInner: { width: "100%", maxWidth: 560, alignSelf: "center" },
  bottomFooter: {
    position: "relative",
    alignItems: "center",
    paddingTop: 18, paddingHorizontal: 22,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000000", shadowOpacity: 0.30, shadowRadius: 20, shadowOffset: { width: 0, height: -8 } },
      android: { elevation: 12 },
      web: { boxShadow: "0 -10px 28px rgba(0,0,0,0.24)" } as any,
    }),
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "center", flexShrink: 0 },
  brandIconFrame: {
    width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  brandText: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontFamily: "Inter_700Bold", fontWeight: "700", letterSpacing: -0.5, includeFontPadding: false, paddingRight: 4 },
  brandCaption: { color: "rgba(188,215,255,0.58)", fontSize: 8, lineHeight: 10, letterSpacing: 1.8, fontFamily: "Inter_700Bold", marginTop: 1 },
  hero: { width: "100%", alignItems: "center", marginTop: 26, marginBottom: 16 },
  heroMobile: { marginTop: 20, marginBottom: 14 },
  globeBadge: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(52,125,255,0.18)",
    borderWidth: 1, borderColor: "rgba(145,194,255,0.42)", alignItems: "center",
    justifyContent: "center", marginBottom: 18,
  },
  title: {
    width: "100%",
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 34,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.7,
    includeFontPadding: false,
    flexShrink: 1,
    minWidth: 0,
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },
  subtitle: { maxWidth: 440, color: "rgba(255,255,255,0.62)", fontSize: 14, lineHeight: 21, textAlign: "center", fontFamily: "Inter_400Regular", marginTop: 11 },
  languageList: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 6 },
  languageRow: {
    minHeight: 50, flexDirection: "row", alignItems: "center", paddingLeft: 0, paddingRight: 6,
    borderRadius: 999, backgroundColor: "rgba(255,255,255,0.085)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.14)",
    ...Platform.select({
      ios: { shadowColor: "#000000", shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 4 },
      web: { boxShadow: "0 6px 16px rgba(0,0,0,0.20)" } as any,
    }),
  },
  languageRowSelected: {
    backgroundColor: "rgba(30,126,255,0.22)", borderColor: "rgba(125,190,255,0.88)",
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 7px 20px rgba(22,126,255,0.24)" } as any,
    }),
  },
  languageRowPressed: { opacity: 0.76 },
  badgeBubble: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.11)",
    alignItems: "center", justifyContent: "center",
  },
  badgeBubbleSelected: { backgroundColor: "rgba(113,183,255,0.23)" },
  flag: { fontSize: 23, lineHeight: 26 },
  languageInfo: { flex: 1, marginLeft: 10 },
  languageName: { color: "rgba(255,255,255,0.88)", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  languageNameSelected: { color: "#FFFFFF" },
  radio: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.34)", alignItems: "center", justifyContent: "center" },
  radioEdge: { marginRight: 0 },
  radioSelected: { borderColor: "#72B5FF", backgroundColor: "rgba(114,181,255,0.13)" },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#72B5FF" },
  continueButton: {
    width: "100%", maxWidth: 560, minHeight: 50, alignSelf: "center", borderRadius: 999,
    backgroundColor: "#167EFF", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: "#167EFF", shadowOpacity: 0.42, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 7 },
      web: { boxShadow: "0 6px 22px rgba(22,126,255,0.35)" } as any,
    }),
  },
  continueButtonDisabled: {
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
      web: { boxShadow: "none" } as any,
    }),
  },
  continueButtonPressed: { opacity: 0.84 },
  continueText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },
  continueArrow: { color: "#FFFFFF", fontSize: 21, lineHeight: 24, fontFamily: "Inter_700Bold" },
  requiredHint: { color: "rgba(255,255,255,0.38)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 10 },
});