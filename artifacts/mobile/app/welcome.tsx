import React, { useRef, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Animated,
  Image as RNImage,
  PanResponder,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Image from "@/components/ui/OptimizedImage";
import AfuLogo from "@/components/ui/AfuLogo";

const IL_MESSAGING  = require("@/assets/illustrations/messaging.webp");
const IL_COMMUNITY  = require("@/assets/illustrations/community.webp");
const IL_AI         = require("@/assets/illustrations/ai.webp");
const IL_WALLET     = require("@/assets/illustrations/wallet.webp");
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGE_PREFERENCE_KEY } from "@/context/LanguageContext";
import { useLanguage } from "@/context/LanguageContext";
import { storage, KEYS } from "@/lib/storage/mmkv";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";
import LanguageSelectionStep from "@/components/onboarding/LanguageSelectionStep";
import OnboardingBackdrop, { ONBOARDING_THEME } from "@/components/onboarding/OnboardingBackdrop";

// ─── Slide data ────────────────────────────────────────────────────────────────
const SLIDES = [
  {
    accent: Colors.brand,
    accentAlt: "#7B5EA7",
    title: "welcome.slide_connect_title",
    subtitle: "welcome.slide_connect_subtitle",
    action: "welcome.slide_connect_action",
    illustration: "messaging",
    orb1: { x: 0.15, y: 0.12, size: 280, color: Colors.brand, opacity: 0.18 },
    orb2: { x: 0.85, y: 0.35, size: 220, color: "#7B5EA7", opacity: 0.14 },
    orb3: { x: 0.5, y: 0.58, size: 160, color: Colors.brand, opacity: 0.08 },
  },
  {
    accent: "#AF52DE",
    accentAlt: "#FF6B9D",
    title: "welcome.slide_people_title",
    subtitle: "welcome.slide_people_subtitle",
    action: "welcome.slide_people_action",
    illustration: "community",
    orb1: { x: 0.8, y: 0.08, size: 260, color: "#AF52DE", opacity: 0.18 },
    orb2: { x: 0.1, y: 0.42, size: 200, color: "#FF6B9D", opacity: 0.12 },
    orb3: { x: 0.6, y: 0.62, size: 180, color: "#7B2FBE", opacity: 0.10 },
  },
  {
    accent: "#FF9500",
    accentAlt: "#FF6B35",
    title: "welcome.slide_create_title",
    subtitle: "welcome.slide_create_subtitle",
    action: "welcome.slide_create_action",
    illustration: "ai",
    orb1: { x: 0.5, y: 0.05, size: 300, color: "#FF6B35", opacity: 0.16 },
    orb2: { x: 0.15, y: 0.45, size: 200, color: "#FF9500", opacity: 0.12 },
    orb3: { x: 0.85, y: 0.55, size: 150, color: "#FFD060", opacity: 0.10 },
  },
  {
    accent: "#34C759",
    accentAlt: "#00D4AA",
    title: "welcome.slide_value_title",
    subtitle: "welcome.slide_value_subtitle",
    action: "welcome.slide_value_action",
    illustration: "wallet",
    orb1: { x: 0.2, y: 0.10, size: 240, color: "#00D4AA", opacity: 0.16 },
    orb2: { x: 0.82, y: 0.38, size: 220, color: "#34C759", opacity: 0.14 },
    orb3: { x: 0.45, y: 0.60, size: 170, color: "#00B884", opacity: 0.09 },
  },
];

const SWIPE_THRESHOLD = 52;
const BG = ONBOARDING_THEME.background;

// ─── Illustration sources (all pre-loaded at require time) ────────────────────
const IL_SOURCES: { key: string; src: any }[] = [
  { key: "messaging", src: IL_MESSAGING },
  { key: "community", src: IL_COMMUNITY },
  { key: "ai",        src: IL_AI },
  { key: "wallet",    src: IL_WALLET },
];

type OnboardingPageProps = {
  slide: (typeof SLIDES)[number];
  pageIndex: number;
  slideIndex: number;
  totalPages: number;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
  activeIndex: number;
  onNext: (index: number) => void;
  onSkip: () => void;
  onSelect: (index: number) => void;
};

function OnboardingPage({
  slide,
  pageIndex,
  slideIndex,
  totalPages,
  width,
  height,
  topInset,
  bottomInset,
  activeIndex,
  onNext,
  onSkip,
  onSelect,
}: OnboardingPageProps) {
  const isLast = pageIndex === totalPages - 1;
  const { t } = useLanguage();

  return (
    <View style={[s.page, { width, height, backgroundColor: BG }]}>
      {/* Every page owns its illustration, background orbs, header, and CTA.
          The parent track moves this complete surface as one unit. */}
      <OnboardingBackdrop />
      <View style={[s.illustrationBg, { pointerEvents: "none" }]}>
        <Image
          source={IL_SOURCES[slideIndex].src}
          style={s.illustrationBgImage}
          resizeMode="contain"
        />
      </View>

      <View style={[s.topBar, { paddingTop: topInset + 12 }]}>
        <View style={s.logoRow}>
          <AfuLogo size={22} forceTheme="dark" />
          <Text style={s.logoText}>AfuChat</Text>
        </View>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <View style={s.skipPill}>
            <Text
              style={s.skipText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {t("welcome.skip")}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[s.card, { paddingBottom: Math.max(bottomInset, 20) + 8 }]}>
        <LinearGradient
          colors={[slide.accent + "55", slide.accentAlt + "30", "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.cardTopBorder}
        />

        <View>
          <Text style={s.title}>{t(slide.title)}</Text>
          <Text style={s.subtitle}>{t(slide.subtitle)}</Text>
        </View>

        <View style={s.progressRow}>
          {Array.from({ length: totalPages }, (_, i) => {
            const active = i === activeIndex;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => onSelect(i)}
                hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              >
                <View style={[s.progressSegment, { backgroundColor: "rgba(255,255,255,0.12)" }]}>
                  <LinearGradient
                    colors={active ? [slide.accent, slide.accentAlt] : ["transparent", "transparent"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 2 }]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={s.ctaWrap} onPress={() => onNext(pageIndex)} activeOpacity={0.84}>
          <LinearGradient
            colors={[slide.accent, slide.accentAlt]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Text
              style={s.ctaText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {t(slide.action)}
            </Text>
            <View style={s.ctaArrowCircle}>
              <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={22} color="#111827" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <View style={s.hintRow}>
          <Text
            style={s.hintText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {t("welcome.already_have_account")}{" "}
          </Text>
          <TouchableOpacity onPress={onSkip} hitSlop={8}>
            <Text
              style={[s.hintLink, { color: slide.accent }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {t("welcome.sign_in")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = useWindowDimensions();
  const [languageStep, setLanguageStep] = useState<boolean | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const isBusyRef = useRef(false);
  const pageX = useRef(new Animated.Value(0)).current;
  const showLanguagePage = languageStep === true;
  const totalPages = SLIDES.length + (showLanguagePage ? 1 : 0);
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) goTo(activeIndexRef.current + 1);
        else if (g.dx > SWIPE_THRESHOLD) goTo(activeIndexRef.current - 1);
      },
    }),
  ).current;

  useEffect(() => {
    if (user) router.replace("/(tabs)/discover");
  }, [user]);

  useEffect(() => {
    let mounted = true;
    // Browser storage can be unavailable or leave a promise pending in an
    // embedded preview. Onboarding must never remain on its background-only
    // loading state; fall back to the language picker after a short timeout.
    Promise.race([
      AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
    ])
      .then((stored) => {
        if (mounted) setLanguageStep(!stored || stored === "none");
      })
      .catch(() => {
        if (mounted) setLanguageStep(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (languageStep === null) {
    return (
      <View style={[s.root, { backgroundColor: BG }]}>
        <OnboardingBackdrop />
      </View>
    );
  }

  function goTo(nextIdx: number) {
    const current = activeIndexRef.current;
    if (isBusyRef.current || nextIdx === current || nextIdx < 0 || nextIdx >= totalPagesRef.current) return;
    isBusyRef.current = true;
    activeIndexRef.current = nextIdx;
    setActiveIndex(nextIdx);
    Haptics.selectionAsync();
    Animated.timing(pageX, {
      toValue: -nextIdx * SW,
      duration: 360,
      useNativeDriver: Platform.OS !== "web",
    }).start(({ finished }) => {
      isBusyRef.current = false;
      if (!finished) {
        pageX.setValue(-activeIndexRef.current * SW);
      }
    });
  }

  const finish = () => {
    if (isBusyRef.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { storage.setBoolean(KEYS.ONBOARDING_DONE, true); } catch {}
    // The root auth-group transition is directional, so login slides in rather
    // than replacing the onboarding screen as an instant jump.
    router.replace("/(auth)/login");
  };

  const goNext = (index: number) => {
    if (index < totalPages - 1) goTo(index + 1);
    else finish();
  };

  return (
    <View style={[s.root, { backgroundColor: BG }]} {...panResponder.panHandlers}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <Animated.View
        style={[
          s.pageTrack,
          { width: SW * totalPages, height: SH, transform: [{ translateX: pageX }] },
        ]}
      >
        {showLanguagePage && (
          <View style={{ width: SW, height: SH }}>
            <LanguageSelectionStep onComplete={() => goNext(0)} />
          </View>
        )}
        {SLIDES.map((slide, index) => (
          <OnboardingPage
            key={index}
            slide={slide}
            pageIndex={index + (showLanguagePage ? 1 : 0)}
            slideIndex={index}
            totalPages={totalPages}
            width={SW}
            height={SH}
            topInset={insets.top}
            bottomInset={insets.bottom}
            activeIndex={activeIndex}
            onNext={goNext}
            onSkip={finish}
            onSelect={goTo}
          />
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Screen styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  pageTrack: {
    flexDirection: "row",
  },
  page: {
    flexShrink: 0,
    overflow: "hidden",
  },

  topBar: {
    position: "absolute",
    top: 0,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    zIndex: 10,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  logoImg: {
    width: 26,
    height: 26,
  },
  logoText: {
    color: "#fff",
    fontSize: 17,
    lineHeight: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    letterSpacing: -0.3,
    includeFontPadding: false,
    paddingRight: 4,
  },
  skipPill: {
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 999,
  },
  skipText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  stepPill: {
    backgroundColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
  },
  stepText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  // Illustration sits in the background layer behind orbs + gradient.
  // Full-width, anchored to the top half of the screen so it blends naturally.
  illustrationBg: {
    position: "absolute",
    left: 0, right: 0,
    top: 0,
    height: "62%" as any,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  illustrationBgImage: {
    width: "92%" as any,
    height: "100%" as any,
  },
  languageIllustration: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 36,
  },
  languageGlobe: {
    width: 190,
    height: 190,
    borderRadius: 95,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30,126,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(145,194,255,0.34)",
  },

  card: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 26,
    paddingTop: 24,
  },
  cardTopBorder: {
    position: "absolute",
    top: 0, left: 26, right: 26,
    height: 1.5,
    borderRadius: 1,
    marginBottom: 0,
  },

  title: {
    fontSize: 38,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
    lineHeight: 46,
    color: "#FFFFFF",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 23,
    color: "rgba(255,255,255,0.60)",
    marginBottom: 28,
  },

  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 22,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  languageOptionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 22,
  },
  languageOption: {
    flexGrow: 1,
    flexBasis: "46%" as any,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  languageOptionSelected: {
    backgroundColor: "rgba(30,126,255,0.23)",
    borderColor: "rgba(125,190,255,0.88)",
  },
  languageFlag: {
    fontSize: 20,
    lineHeight: 24,
    marginRight: 8,
  },
  languageOptionName: {
    flex: 1,
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  languageOptionNameSelected: {
    color: "#FFFFFF",
  },
  languageRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  languageRadioSelected: {
    borderColor: "#72B5FF",
    backgroundColor: "rgba(114,181,255,0.13)",
  },
  languageRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#72B5FF",
  },

  ctaWrap: {
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 16,
  },
  ctaWrapDisabled: {
    opacity: 0.9,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 62,
    gap: 12,
    paddingHorizontal: 16,
  },
  ctaText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "center",
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },
  ctaTextDisabled: {
    color: "rgba(255,255,255,0.45)",
  },
  ctaArrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ctaArrowCircleDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  ctaArrow: {
    fontSize: 21,
    fontFamily: "Inter_700Bold",
  },

  hintRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 13.5,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.30)",
    flexShrink: 1,
    minWidth: 0,
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },
  hintLink: {
    fontSize: 13.5,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
    minWidth: 0,
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as any,
    }),
  },
});
