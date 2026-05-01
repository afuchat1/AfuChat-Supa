import React, { useEffect, useRef, useState } from "react";
import { useAppAccent } from "@/context/AppAccentContext";
import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NotFoundScreen from "@/app/+not-found";

const afuSymbol = require("@/assets/images/afu-symbol.png");

function safeNavigate(path: string, params?: Record<string, string>) {
  try {
    if (params) {
      router.replace({ pathname: path as any, params });
    } else {
      router.replace(path as any);
    }
  } catch {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const url = params
        ? path.replace(/\[(\w+)\]/g, (_, k) => params[k] || "")
        : path;
      window.location.href = url;
    }
  }
}

export default function HandleScreen() {
  const { accent } = useAppAccent();
  const { handle: rawHandle } = useLocalSearchParams<{ handle: string }>();
  const { session, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [dataReady, setDataReady] = useState(false);

  const cleanHandle = (rawHandle || "").replace(/^@/, "").toLowerCase();
  const isValidHandle = /^[a-zA-Z0-9_]+$/.test(cleanHandle);

  useEffect(() => {
    if (!cleanHandle || !isValidHandle) {
      setDataReady(true);
      return;
    }

    supabase
      .from("profiles")
      .select("id")
      .eq("handle", cleanHandle)
      .single()
      .then(({ data }) => {
        if (data?.id) {
          setProfileId(data.id);
        } else {
          setProfileNotFound(true);
        }
        setDataReady(true);
      })
      .catch(() => {
        setProfileNotFound(true);
        setDataReady(true);
      });
  }, [cleanHandle, isValidHandle]);

  useEffect(() => {
    if (hasNavigated.current) return;
    if (!dataReady) return;
    if (authLoading) return;
    if (!navigationState?.key) return;
    // Profile not found — stay on this screen and show the 404 UI.
    if (profileNotFound || !cleanHandle || !isValidHandle) return;

    hasNavigated.current = true;

    if (session) {
      if (profileId) {
        safeNavigate("/contact/[id]", { id: profileId });
      }
      // profileId null but profileNotFound not set yet — wait
    } else {
      if (profileId) {
        // Valid profile + not logged in → invite flow: save handle, go to register
        AsyncStorage.setItem("referrer_handle", cleanHandle).catch(() => {});
        safeNavigate("/(auth)/register");
      }
      // profileNotFound handled above
    }
  }, [dataReady, authLoading, navigationState?.key, cleanHandle, isValidHandle, profileId, profileNotFound, session]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (hasNavigated.current) return;
    const timeout = setTimeout(() => {
      if (hasNavigated.current) return;
      if (!dataReady) return;
      if (profileNotFound) return; // stay on 404 — don't force-navigate away
      hasNavigated.current = true;
      if (typeof window !== "undefined") {
        window.location.href = session ? "/" : "/register";
      }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [dataReady, session, profileNotFound]);

  // Show designed 404 when the handle doesn't match any user
  if (dataReady && (profileNotFound || !isValidHandle)) {
    return <NotFoundScreen />;
  }

  return (
    <View style={[styles.container, { backgroundColor: accent, paddingTop: insets.top }]}>
      <Image source={afuSymbol} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brandText}>AfuChat</Text>
      <ActivityIndicator size="small" color="#fff" style={styles.loader} />
      <Text style={styles.subText}>
        {session ? "Loading profile..." : "Processing invite..."}
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
