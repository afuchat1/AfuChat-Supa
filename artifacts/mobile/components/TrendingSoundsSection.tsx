import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

const USE_NATIVE = Platform.OS !== "web";

type TrendingSound = {
  name: string;
  count: number;
  artUrl: string | null;
};

function VinylIcon({ artUrl, accent }: { artUrl: string | null; accent: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    anim.current = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE,
      })
    );
    anim.current.start();
    return () => anim.current?.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={[styles.vinyl, { borderColor: accent + "44", transform: [{ rotate }] }]}>
      {artUrl ? (
        <ExpoImage
          source={{ uri: artUrl }}
          style={styles.vinylArt}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.vinylFallback, { backgroundColor: accent + "22" }]}>
          <Ionicons name="musical-note" size={20} color={accent} />
        </View>
      )}
      {/* Centre hole */}
      <View style={[styles.vinylHole, { backgroundColor: accent }]} />
    </Animated.View>
  );
}

function SoundCard({ sound, accent, surface, text, muted }: {
  sound: TrendingSound;
  accent: string;
  surface: string;
  text: string;
  muted: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.93, useNativeDriver: USE_NATIVE, tension: 300, friction: 7 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: USE_NATIVE, tension: 300, friction: 7 }),
    ]).start();
    router.push({
      pathname: "/moments/create-video",
      params: { soundName: sound.name },
    } as any);
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={handlePress}
        style={[styles.card, { backgroundColor: surface }]}
      >
        <VinylIcon artUrl={sound.artUrl} accent={accent} />
        <Text
          style={[styles.soundName, { color: text }]}
          numberOfLines={2}
        >
          {sound.name}
        </Text>
        <Text style={[styles.soundCount, { color: muted }]}>
          {sound.count >= 1000
            ? (sound.count / 1000).toFixed(1).replace(/\.0$/, "") + "K"
            : sound.count}{" "}
          videos
        </Text>
        <View style={[styles.useBtn, { backgroundColor: accent }]}>
          <Ionicons name="add" size={12} color="#fff" />
          <Text style={styles.useBtnText}>Use sound</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

async function fetchAlbumArt(name: string): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=song&limit=1&media=music`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const artwork = json?.results?.[0]?.artworkUrl100;
    if (!artwork) return null;
    return (artwork as string).replace("100x100bb", "300x300bb");
  } catch {
    return null;
  }
}

export function TrendingSoundsSection() {
  const { colors } = useTheme();
  const [sounds, setSounds] = useState<TrendingSound[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("posts")
        .select("audio_name")
        .not("audio_name", "is", null)
        .not("video_url", "is", null)
        .gte("created_at", since)
        .limit(500);

      if (error || !data) return;

      const counts: Record<string, number> = {};
      for (const row of data) {
        const n = (row.audio_name as string).trim();
        if (n) counts[n] = (counts[n] || 0) + 1;
      }

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count, artUrl: null as string | null }));

      if (sorted.length === 0) { setLoading(false); return; }

      setSounds(sorted);
      setLoading(false);

      const artResults = await Promise.all(sorted.map((s) => fetchAlbumArt(s.name)));
      setSounds(sorted.map((s, i) => ({ ...s, artUrl: artResults[i] })));
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || sounds.length === 0) return null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Ionicons name="musical-notes" size={18} color={colors.accent} />
        <Text style={[styles.title, { color: colors.text }]}>Trending Sounds</Text>
        <Text style={[styles.sub, { color: colors.textMuted ?? colors.text + "88" }]}>
          Tap to use in your video
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        decelerationRate="fast"
      >
        {sounds.map((s) => (
          <SoundCard
            key={s.name}
            sound={s}
            accent={colors.accent}
            surface={colors.backgroundTertiary ?? colors.surface ?? colors.background}
            text={colors.text}
            muted={colors.textMuted ?? colors.textSecondary ?? colors.text + "88"}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const CARD_W = 138;

const styles = StyleSheet.create({
  root: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginLeft: 2,
  },
  list: {
    paddingHorizontal: 12,
    gap: 10,
  },
  card: {
    width: CARD_W,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  vinyl: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  vinylArt: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  vinylFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  vinylHole: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  soundName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 17,
  },
  soundCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  useBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 2,
  },
  useBtnText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
