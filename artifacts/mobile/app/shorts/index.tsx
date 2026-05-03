/**
 * /shorts route — single source of truth for the vertical video feed.
 *
 * Resolves the latest public video post and hands off to /video/[id], so we
 * have ONE video player implementation app-wide (the one in app/video/[id].tsx)
 * instead of two competing scrolls.
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, StyleSheet, Platform } from "react-native";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useIsDesktop } from "@/hooks/useIsDesktop";

export default function ShortsRedirect() {
  const { isDesktop } = useIsDesktop();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktop) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: dbErr } = await supabase
          .from("posts")
          .select("id")
          .eq("post_type", "video")
          .eq("visibility", "public")
          .not("video_url", "is", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (cancelled) return;
        if (dbErr) {
          setError("Could not load Shorts");
          return;
        }
        const first = data?.[0];
        if (!first?.id) {
          setError("No videos yet");
          return;
        }
        router.replace({ pathname: "/video/[id]", params: { id: first.id } });
      } catch {
        if (!cancelled) setError("Could not load Shorts");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isDesktop) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.mobileOnlyIcon}>
          <Ionicons name="phone-portrait-outline" size={48} color="rgba(255,255,255,0.4)" />
        </View>
        <Text style={styles.mobileOnlyTitle}>Videos are mobile-only</Text>
        <Text style={styles.mobileOnlySubtitle}>
          Open AfuChat on your phone to watch videos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <ActivityIndicator color="#fff" size="large" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  mobileOnlyIcon: {
    marginBottom: 20,
  },
  mobileOnlyTitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },
  mobileOnlySubtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  errorText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
