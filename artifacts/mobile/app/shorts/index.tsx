/**
 * /shorts route — single source of truth for the vertical video feed.
 *
 * Resolves the latest public video post and hands off to /video/[id], so we
 * have ONE video player implementation app-wide (the one in app/video/[id].tsx)
 * instead of two competing scrolls.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { ShortsFeedSkeleton } from "@/components/ui/Skeleton";
import { supabase } from "@/lib/supabase";

export default function ShortsRedirect() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
          setError("Could not load Shorts. Check the Status page under Settings if this persists.");
          return;
        }
        const first = data?.[0];
        if (!first?.id) {
          setError("No videos yet — check back soon.");
          return;
        }
        router.replace({ pathname: "/video/[id]", params: { id: first.id } });
      } catch {
        if (!cancelled) setError("Could not load Shorts");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ShortsFeedSkeleton dark />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
