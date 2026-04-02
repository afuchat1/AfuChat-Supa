import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, View } from "react-native";

const afuIcon = require("@/assets/images/icon.png");
const BRAND = "#00BCD4";

export function SplashOverlay({ onFinish }: { onFinish: () => void }) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const [fading, setFading] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== "web",
      }).start();
    });

    const fadeTimer = setTimeout(() => {
      setFading(true);
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: Platform.OS !== "web",
      }).start(() => {
        onFinish();
      });
    }, 2000);

    const fallback = setTimeout(onFinish, 4000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: overlayOpacity }]} pointerEvents="none">
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <Image
            source={afuIcon}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text style={[styles.title, { opacity: textOpacity }]}>
          AfuChat
        </Animated.Text>

        <Animated.Text style={[styles.tagline, { opacity: textOpacity }]}>
          Connect with everyone, everywhere.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: 12,
  },
  logoWrap: {
    width: 120,
    height: 120,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 16,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
});
