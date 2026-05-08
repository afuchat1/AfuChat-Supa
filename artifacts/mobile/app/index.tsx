import { useEffect, useRef } from "react";
import { ActivityIndicator, Image, StyleSheet, View, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";
import { useAppAccent } from "@/context/AppAccentContext";

const afuLogo = require("@/assets/images/afu-symbol.png");

export default function IndexScreen() {
  const { accent } = useAppAccent();
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);
  // A shared profile link like afuchat.com/@amkaweesi can sometimes land here
  // as /?handle=@amkaweesi if Expo Router can't match the @ path on web.
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

  // If a ?handle= query param arrived (e.g. from a shared profile link that
  // landed on the root route), forward to the [handle] route so the public
  // profile is shown — or the contact page for logged-in users.
  useEffect(() => {
    if (!handle || redirected.current || loading) return;
    redirected.current = true;
    router.replace(`/${handle}` as any);
  }, [handle, loading]);

  // Redirect once auth state is known (normal splash flow)
  useEffect(() => {
    if (loading) return;
    if (handle) return; // handled by the effect above
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed ?? true,
      session?.user?.id,
    );
  }, [session, profile, loading, handle]);

  // Safety timeout — only fires if auth takes too long
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
    }, 8000);
    return () => clearTimeout(timeout);
  }, [handle]);

  return (
    <View style={[styles.container, { backgroundColor: accent }]}>
      <Image source={afuLogo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brandText}>AfuChat</Text>
      <ActivityIndicator size="small" color="#fff" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 24,
  },
  brandText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 16,
    letterSpacing: 0.5,
  },
  loader: {
    position: "absolute",
    bottom: 80,
  },
});
