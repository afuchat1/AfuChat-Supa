/**
 * SplashScreenView
 *
 * JS-side splash overlay shown while fonts and assets load.
 *
 * Light mode uses the black logo on white. Dark mode uses the white
 * notification/logo mark on black. No app-icon or blue splash artwork is used.
 *
 * Fades out quickly once `ready` becomes true, then calls `onDone`
 * so the parent can call SplashScreen.hideAsync().
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LOGO_BLACK_B64 } from "@/lib/logoAssets";
import { LOGO_WHITE_BOLD_B64 } from "@/lib/logoWhiteBold";

const { width } = Dimensions.get("window");
const LOGO_SIZE = Math.min(width * 0.32, 130);
const LOGO_WHITE = { uri: LOGO_WHITE_BOLD_B64 };

interface Props {
  ready: boolean;
  onDone: () => void;
}

export function SplashScreenView({ ready, onDone }: Props) {
  const opacity    = useRef(new Animated.Value(1)).current;
  const scale      = useRef(new Animated.Value(1)).current;
  const doneFired  = useRef(false);
  const onDoneRef  = useRef(onDone);
  onDoneRef.current = onDone;

  // Detect theme: check stored user preference first, fall back to system
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = React.useState(systemScheme === "dark");

  React.useEffect(() => {
    AsyncStorage.getItem("@afuchat_theme")
      .then((val) => {
        if (val === "dark")       setIsDark(true);
        else if (val === "light") setIsDark(false);
        else                      setIsDark(systemScheme === "dark");
      })
      .catch(() => setIsDark(systemScheme === "dark"));
  }, [systemScheme]);

  useEffect(() => {
    if (!ready || doneFired.current) return;
    doneFired.current = true;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        delay: 0,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.08,
        duration: 180,
        delay: 0,
        useNativeDriver: true,
      }),
    ]).start(() => onDoneRef.current());
  }, [ready, opacity, scale]);

  const bg            = isDark ? "#000000" : "#FFFFFF";
  const wordmarkColor = isDark ? "#FFFFFF" : "#000000";
  const taglineColor  = isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.48)";
  const logoSource    = isDark ? LOGO_WHITE : { uri: LOGO_BLACK_B64 };

  return (
    <Animated.View
      style={[styles.container, { opacity, backgroundColor: bg }, { pointerEvents: "none" }] as any}
    >
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }] }]}>
        <Image
          source={logoSource}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="AfuChat logo"
        />
      </Animated.View>

      <View style={styles.wordmarkRow}>
        <Text style={[styles.wordmark, { color: wordmarkColor }]}>
          Afu<Text style={[styles.wordmarkAccent, { color: wordmarkColor }]}>Chat</Text>
        </Text>
      </View>

      <View style={styles.taglineWrap}>
        <Text style={[styles.tagline, { color: taglineColor }]}>
          Connect · Discover · Create
        </Text>
      </View>
    </Animated.View>
  );
}

export default SplashScreenView;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif-medium",
      default: "System",
    }),
  },
  wordmarkAccent: {
    color: "#1018D8",
  },
  taglineWrap: {
    marginTop: 10,
  },
  tagline: {
    fontSize: 12,
    letterSpacing: 1.2,
    fontFamily: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "System",
    }),
  },
});
