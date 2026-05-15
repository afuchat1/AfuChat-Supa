import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

const STORAGE_KEY = "afu_community_banner_v1_seen";
const USE_NATIVE_DRIVER = Platform.OS !== "web";

type Channel = {
  label: string;
  sub: string;
  url: string;
  icon: keyof typeof import("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");
  iconColor: string;
  bg: string;
};

const CHANNELS: Channel[] = [
  {
    label: "Telegram Channel",
    sub: "t.me/afuchat",
    url: "https://t.me/afuchat",
    icon: "paper-plane",
    iconColor: "#fff",
    bg: "#0088CC",
  },
  {
    label: "Founder",
    sub: "t.me/amkaweesi",
    url: "https://t.me/amkaweesi",
    icon: "person-circle",
    iconColor: "#fff",
    bg: "#0088CC",
  },
  {
    label: "Support Group",
    sub: "t.me/afumeet",
    url: "https://t.me/afumeet",
    icon: "people",
    iconColor: "#fff",
    bg: "#229ED9",
  },
  {
    label: "WhatsApp Channel",
    sub: "Follow on WhatsApp",
    url: "https://whatsapp.com/channel/0029Vb7Rbpz0Vyc9y3S8H422",
    icon: "logo-whatsapp",
    iconColor: "#fff",
    bg: "#25D366",
  },
];

export default function CommunityBanner({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(500)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) {
        setVisible(true);
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 65,
            friction: 11,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
          Animated.timing(backdropAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: USE_NATIVE_DRIVER,
          }),
        ]).start();
      }
    });
  }, [userId]);

  function dismiss() {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 600,
        duration: 280,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start(() => {
      setVisible(false);
      AsyncStorage.setItem(STORAGE_KEY, "1");
    });
  }

  function openLink(url: string) {
    Linking.openURL(url).catch(() => {});
  }

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropAnim, pointerEvents: "none" } as any]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20),
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["#00BCD4", "#0097A7"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <View style={styles.headerIconWrap}>
              <Ionicons name="people-circle" size={38} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Join Our Community</Text>
            <Text style={styles.headerSub}>
              Stay connected with AfuChat on Telegram & WhatsApp
            </Text>

            <TouchableOpacity style={styles.closeBtn} onPress={dismiss} hitSlop={12}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.channels}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.url}
                style={styles.channelRow}
                activeOpacity={0.75}
                onPress={() => openLink(ch.url)}
              >
                <View style={[styles.channelIcon, { backgroundColor: ch.bg }]}>
                  <Ionicons name={ch.icon as any} size={22} color={ch.iconColor} />
                </View>
                <View style={styles.channelText}>
                  <Text style={styles.channelLabel}>{ch.label}</Text>
                  <Text style={styles.channelSub}>{ch.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#bbb" />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={dismiss}>
            <LinearGradient
              colors={["#00BCD4", "#0097A7"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>Got it, thanks!</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={dismiss} style={styles.skipBtn} hitSlop={12}>
            <Text style={styles.skipText}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 -4px 20px rgba(0,0,0,0.15)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 24 },
    }),
  },

  header: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  headerSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
  },
  closeBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  channels: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 4,
  },
  channelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  channelIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  channelText: { flex: 1 },
  channelLabel: {
    color: "#111",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  channelSub: {
    color: "#888",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },

  cta: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  ctaGradient: {
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },

  skipBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  skipText: {
    color: "#aaa",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
