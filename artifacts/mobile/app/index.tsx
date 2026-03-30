import { useEffect, useRef } from "react";
import { ActivityIndicator, Image, StyleSheet, View, Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

const afuLogo = require("@/assets/images/afu-symbol.png");

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();
  const redirected = useRef(false);

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
      // Non-logged-in users land on the tabs root — the tab layout
      // will show the correct first visible tab (search/discover)
      router.replace("/(tabs)");
    }
  }

  // Redirect once auth state is known
  useEffect(() => {
    if (loading) return;
    doRedirect(
      !!session,
      !!profile,
      profile?.onboarding_completed ?? true,
      session?.user?.id,
    );
  }, [session, profile, loading]);

  // Safety timeout — only fires if auth takes too long
  useEffect(() => {
    const timeout = setTimeout(() => {
      // If auth is still loading at 8s, treat as unauthenticated and go to tabs
      // (the tabs layout will redirect to onboarding / login as needed)
      if (!redirected.current) {
        redirected.current = true;
        router.replace("/(tabs)");
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={styles.container}>
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
    backgroundColor: Colors.brand,
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
