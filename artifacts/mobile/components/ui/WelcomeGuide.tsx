import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/hooks/useTheme";

const { width: SCREEN_W } = Dimensions.get("window");
export const WELCOME_GUIDE_KEY = "afu_welcome_guide_v1_seen";

type SlideItem = {
  id: string;
  icon: string;
  iconBg: string;
  gradient: readonly [string, string, ...string[]];
  title: string;
  subtitle: string;
  features: string[];
  isLast?: boolean;
};

const SLIDES: SlideItem[] = [
  {
    id: "welcome",
    icon: "chatbubbles",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#00BCD4", "#006064"],
    title: "Welcome to AfuChat!",
    subtitle: "The social platform built for real, meaningful conversations.",
    features: ["Chat, post & discover content", "Connect with people worldwide", "Earn rewards as you engage"],
  },
  {
    id: "chat",
    icon: "lock-closed",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#5C6BC0", "#283593"],
    title: "Private & Secure Chats",
    subtitle: "Message anyone with confidence — your conversations stay yours.",
    features: ["Send voice notes instantly", "Share photos, videos & files", "Group chats & communities"],
  },
  {
    id: "discover",
    icon: "compass",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#26A69A", "#004D40"],
    title: "Discover Your World",
    subtitle: "A content feed curated around your interests and passions.",
    features: ["Read articles from creators", "Watch short-form videos", "Follow topics you love"],
  },
  {
    id: "afuai",
    icon: "sparkles",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#AB47BC", "#4A148C"],
    title: "Meet AfuAI",
    subtitle: "Your always-on intelligent assistant, ready when you need it.",
    features: ["Ask questions, get smart answers", "Summarize long threads instantly", "Generate posts & captions"],
  },
  {
    id: "wallet",
    icon: "wallet",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#FF7043", "#BF360C"],
    title: "Earn ACoins Daily",
    subtitle: "Your activity on AfuChat earns you real in-app rewards.",
    features: ["Daily check-in for ACoins", "Unlock premium features", "Send & receive between friends"],
  },
  {
    id: "community",
    icon: "people",
    iconBg: "rgba(255,255,255,0.25)",
    gradient: ["#00BCD4", "#006064"],
    title: "You're Part of the Family",
    subtitle: "A growing community of creators, learners, and connectors.",
    features: ["Join our Telegram & WhatsApp groups", "Get support from the AfuChat team", "Help shape the future of the app"],
    isLast: true,
  },
];

function Slide({
  item,
  width,
  displayName,
}: {
  item: SlideItem;
  width: number;
  displayName?: string;
}) {
  const title = item.id === "welcome" && displayName
    ? `Welcome, ${displayName.split(" ")[0]}!`
    : item.title;

  return (
    <LinearGradient
      colors={item.gradient}
      style={[styles.slide, { width }]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
    >
      <View style={styles.slideInner}>
        <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
          <Ionicons name={item.icon as any} size={52} color="#fff" />
        </View>

        <Text style={styles.slideTitle}>{title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>

        <View style={styles.featureList}>
          {item.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureBullet}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

interface WelcomeGuideProps {
  visible: boolean;
  onDismiss: () => void;
  displayName?: string;
}

export default function WelcomeGuide({ visible, onDismiss, displayName }: WelcomeGuideProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const enterAnim = useRef(new Animated.Value(0)).current;
  const slideW = Math.min(SCREEN_W, 480);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
      enterAnim.setValue(0);
      Animated.spring(enterAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    }
  }, [visible]);

  async function handleDismiss() {
    Animated.timing(enterAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(async () => {
      await AsyncStorage.setItem(WELCOME_GUIDE_KEY, "1");
      onDismiss();
    });
  }

  function goNext() {
    if (currentIndex < SLIDES.length - 1) {
      const nextIdx = currentIndex + 1;
      flatListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      setCurrentIndex(nextIdx);
    } else {
      handleDismiss();
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideW);
    if (idx >= 0 && idx < SLIDES.length) setCurrentIndex(idx);
  }

  if (!visible) return null;

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.container,
          {
            opacity: enterAnim,
            transform: [
              {
                scale: enterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1],
                }),
              },
              {
                translateY: enterAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <TouchableOpacity
            style={[styles.skipBtn, { top: insets.top + 14 }]}
            onPress={handleDismiss}
            hitSlop={12}
          >
            <Text style={styles.skipText}>Skip</Text>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <FlatList
            ref={flatListRef}
            data={SLIDES}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={handleScroll}
            getItemLayout={(_, index) => ({ length: slideW, offset: slideW * index, index })}
            keyExtractor={(s) => s.id}
            renderItem={({ item }) => (
              <Slide item={item} width={slideW} displayName={displayName} />
            )}
            style={{ flexGrow: 0 }}
          />

          <View style={styles.controls}>
            <View style={styles.dotsRow}>
              {SLIDES.map((_, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentIndex ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.nextBtn, isLast && styles.nextBtnLast]}
              onPress={goNext}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {isLast ? "Get Started" : "Next"}
              </Text>
              <Ionicons
                name={isLast ? "rocket-outline" : "arrow-forward"}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 99,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  skipText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  slide: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 28,
    overflow: "hidden",
    marginHorizontal: Platform.OS === "web" ? 0 : 0,
  },
  slideInner: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
    maxWidth: 400,
    width: "100%",
  },
  iconCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  slideTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 36,
  },
  slideSubtitle: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  featureList: {
    gap: 14,
    alignSelf: "stretch",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 22,
  },
  controls: {
    alignItems: "center",
    gap: 20,
    paddingTop: 24,
    paddingBottom: 8,
    width: "100%",
    paddingHorizontal: 28,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  dot: {
    borderRadius: 4,
    height: 8,
  },
  dotActive: {
    width: 28,
    backgroundColor: "#fff",
  },
  dotInactive: {
    width: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00BCD4",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 28,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  nextBtnLast: {
    backgroundColor: "#00BCD4",
  },
  nextBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
