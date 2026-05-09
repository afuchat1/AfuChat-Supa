import { useEffect, useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";

const afuSymbol = require("@/assets/images/afu-symbol.png");

// Flat brand-colour splash shown while auth resolves.
// No gradients, no shadows — clean flat UI per branding guidelines.
function SplashBrand() {
  return (
    <View style={s.root}>
      <Image source={afuSymbol} style={s.logo} resizeMode="contain" />
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
      router.replace("/(tabs)/discover");
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

  // Instant fallback — if auth hasn't resolved within 1.5 s, go straight to
  // the public discover feed. Auth context will redirect again once ready.
  useEffect(() => {
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
  logo: {
    width: 110,
    height: 110,
    tintColor: "#fff",
  },
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
