import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

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
      <ActivityIndicator size="large" color={Colors.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
});
