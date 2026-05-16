import { useEffect, useRef } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import LandingPage from "@/components/landing/LandingPage";

const afuSymbol = require("@/assets/images/afu-symbol.png");

// Native-only flat brand splash shown while auth resolves.
function SplashBrand() {
  return (
    <View style={s.root}>
      <Image source={afuSymbol} style={s.logo} tintColor="#fff" resizeMode="contain" />
      <Text style={s.wordmark}>AfuChat</Text>
      <Text style={s.tagline}>Connect · Chat · Discover</Text>
    </View>
  );
}

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);
  const { handle } = useLocalSearchParams<{ handle?: string }>();

  function doRedirect(hasSession: boolean, profileReady: boolean, profileOnboarded: boolean, userId?: string) {
    if (redirected.current) return;
    redirected.current = true;
    if (hasSession) {
      if (profileReady && !profileOnboarded && userId) {
        router.replace({ pathname: "/onboarding", params: { userId } });
      } else {
        router.replace("/(tabs)");
      }
    } else {
      // On web: don't redirect — show landing page below
      // On native: go to discover
      if (Platform.OS !== "web") {
        router.replace("/(tabs)/discover");
      }
    }
  }

  useEffect(() => {
    if (!handle || redirected.current || loading) return;
    redirected.current = true;
    router.replace(`/${handle}` as any);
  }, [handle, loading]);

  useEffect(() => {
    if (loading) return;
    if (handle) return;
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed ?? true,
      session?.user?.id,
    );
  }, [session, profile, loading, handle]);

  // Native fallback — if auth hasn't resolved within 1.5 s, go to discover.
  // On web we stay on the landing page, so no timeout redirect needed.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const timeout = setTimeout(() => {
      if (!redirected.current) {
        redirected.current = true;
        if (handle) {
          router.replace(`/${handle}` as any);
        } else {
          router.replace("/(tabs)/discover");
        }
      }
    }, 1500);
    return () => clearTimeout(timeout);
  }, [handle]);

  // ── Web: authenticated → redirect to tabs; unauthenticated → landing page ──
  if (Platform.OS === "web") {
    if (!loading && session) {
      // Already logged in — redirect to app
      router.replace("/(tabs)");
      return null;
    }
    // Show landing page (also shown during the brief loading moment on web)
    return <LandingPage />;
  }

  // ── Native: show brand splash while auth resolves ──
  return <SplashBrand />;
}

const BRAND = "#00BCD4";

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  logo: { width: 110, height: 110 },
  wordmark: {
    marginTop: 18,
    color: "#fff",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: "Inter_700Bold",
  },
  tagline: {
    marginTop: 8,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: "Inter_400Regular",
  },
});
