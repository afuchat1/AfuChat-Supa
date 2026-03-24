import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet, View, Text } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

const afuLogo = require("@/assets/images/afu-symbol.png");

export default function IndexScreen() {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (session) {
      if (profile && !profile.onboarding_completed) {
        router.replace({ pathname: "/onboarding", params: { userId: session.user.id } });
      } else {
        router.replace("/(tabs)");
      }
    } else {
      router.replace("/(auth)/login");
    }
  }, [session, profile, loading]);

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
