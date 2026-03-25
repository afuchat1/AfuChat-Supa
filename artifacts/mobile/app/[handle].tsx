import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";

const afuSymbol = require("@/assets/images/afu-symbol.png");

export default function HandleScreen() {
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { colors } = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  const isProfileLink = rawHandle?.startsWith("@");
  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  const isValidHandle = /^[a-zA-Z0-9_]+$/.test(cleanHandle);

  useEffect(() => {
    if (!cleanHandle || !isValidHandle) {
      router.replace("/");
      return;
    }

    if (isProfileLink) {
      navigateToProfile(cleanHandle);
    } else {
      handleReferral(cleanHandle);
    }
  }, [cleanHandle, isProfileLink, isValidHandle]);

  async function navigateToProfile(handle: string) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .single();

      if (data) {
        router.replace({ pathname: "/contact/[id]", params: { id: data.id } });
      } else {
        router.replace("/");
      }
    } catch {
      router.replace("/");
    }
  }

  async function handleReferral(handle: string) {
    try {
      await AsyncStorage.setItem("referrer_handle", handle);

      if (session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/(auth)/register");
      }
    } catch {
      router.replace("/");
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.brand, paddingTop: insets.top }]}>
      <Image source={afuSymbol} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brandText}>AfuChat</Text>
      <ActivityIndicator size="small" color="#fff" style={styles.loader} />
      <Text style={styles.subText}>
        {isProfileLink ? "Loading profile..." : "Processing referral..."}
      </Text>
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
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  brandText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
    marginTop: 12,
  },
  loader: {
    marginTop: 24,
  },
  subText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    marginTop: 8,
  },
});
