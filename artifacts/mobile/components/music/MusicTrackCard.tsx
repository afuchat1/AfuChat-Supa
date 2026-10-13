import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { showAlert } from "@/lib/alert";
import { getMusicTrackById, purchaseMusicTrack } from "@/lib/afuMusic";
import type { AfuMusicTrack } from "@/modules/afumusic";
import { useAfuMusicPlayer } from "@/modules/afumusic/MusicPlayerContext";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  trackId: string;
  mode?: "post" | "video";
  isActive?: boolean;
  audioMode?: "original" | "mix" | "replace";
  musicVolume?: number;
};

export default function MusicTrackCard({
  trackId,
  mode = "post",
  isActive = false,
  audioMode = "mix",
  musicVolume = 0.75,
}: Props) {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const player = useAfuMusicPlayer();
  const [track, setTrack] = useState<AfuMusicTrack | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const balance = Math.max(0, Math.floor(Number(profile?.acoin ?? 0)));

  const refresh = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const fresh = await getMusicTrackById(trackId);
      setTrack(fresh);
      setFailed(!fresh);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (mode !== "video" || !isActive || audioMode === "original" || !track) return;
    if (!track.videoUseAllowed || (track.price > 0 && !track.isOwned)) return;
    player.play(track, [track], "Shot soundtrack", {
      source: "shot",
      showPlayer: false,
      volume: musicVolume,
    }).catch(() => {});
    return () => player.stopShot(trackId);
  }, [audioMode, isActive, mode, musicVolume, player.play, player.stopShot, track?.id, track?.isOwned, track?.videoUseAllowed]);

  const playTrack = async (nextTrack: AfuMusicTrack) => {
    await player.play(
      nextTrack,
      [nextTrack],
      "AfuMusic",
      mode === "video"
        ? { source: "shot", showPlayer: false, volume: musicVolume }
        : { source: "library", showPlayer: true },
    );
  };

  const activate = () => {
    if (!user) {
      router.push("/(auth)/login" as any);
      return;
    }
    if (loading) return;
    if (!track) {
      showAlert("Track unavailable", "This AfuMusic track is no longer available.");
      return;
    }
    if (mode === "video" && !track.videoUseAllowed) {
      showAlert("Video use is not permitted", "The creator has not cleared this track for use in AfuChat videos.");
      return;
    }
    if (track.price > 0 && !track.isOwned) {
      const buy = async () => {
        setBusy(true);
        try {
          await purchaseMusicTrack(track.id);
          const fresh = await getMusicTrackById(track.id);
          if (!fresh?.isOwned) throw new Error("Purchase succeeded, but track access could not be verified.");
          setTrack(fresh);
          if (mode !== "video") await playTrack(fresh);
        } catch (error) {
          showAlert("Purchase could not be completed", error);
        } finally {
          setBusy(false);
        }
      };
      showAlert(
        "Unlock this track",
        `${track.title} by ${track.artist}\nPrice: ${track.price} ACoin · Your balance: ${balance} ACoin`,
        balance >= track.price
          ? [
              { text: "Cancel", style: "cancel" },
              { text: `Buy for ${track.price} ACoin`, onPress: buy },
            ]
          : [
              { text: "Not now", style: "cancel" },
              { text: "Open AfuPay", onPress: () => router.push("/app/afupay" as any) },
            ],
      );
      return;
    }
    void playTrack(track).catch((error) => showAlert("Playback unavailable", error));
  };

  return (
    <Pressable
      onPress={activate}
      disabled={busy}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={track ? `AfuMusic: ${track.title}, ${track.price === 0 ? "free" : `${track.price} ACoin`}` : "AfuMusic track"}
    >
      <View style={styles.art}>
        <Ionicons name="musical-notes" size={19} color="#FFF9F1" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.kicker, { color: colors.textMuted }]}>AFUMUSIC</Text>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {loading ? "Loading track…" : track?.title || "Track unavailable"}
        </Text>
        <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>
          {track ? `${track.artist} · ${track.genre}` : failed ? "This track is no longer published" : "Secure track details"}
        </Text>
      </View>
      {loading || busy ? (
        <ActivityIndicator size="small" color="#F06451" />
      ) : mode === "video" && track?.videoUseAllowed && isActive && audioMode !== "original" && (track.price === 0 || track.isOwned) ? (
        <View style={styles.playing}><Ionicons name="volume-high" size={13} color="#2F9B70" /><Text style={styles.playingText}>Playing</Text></View>
      ) : (
        <View style={[styles.priceChip, { backgroundColor: track?.price && !track.isOwned ? "#F064511A" : "#2F9B701A" }]}>
          <Ionicons name={track && track.price > 0 && !track.isOwned ? "lock-closed" : "play"} size={12} color={track && track.price > 0 && !track.isOwned ? "#F06451" : "#2F9B70"} />
          <Text style={[styles.priceText, { color: track && track.price > 0 && !track.isOwned ? "#F06451" : "#2F9B70" }]}>
            {track ? (track.price > 0 && !track.isOwned ? `${track.price} ACoin` : "Play") : "Open"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  art: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#F06451", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.15 },
  title: { fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 2 },
  artist: { fontFamily: "Inter_500Medium", fontSize: 10, marginTop: 3 },
  priceChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  priceText: { fontFamily: "Inter_700Bold", fontSize: 9 },
  playing: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#2F9B701A" },
  playingText: { color: "#2F9B70", fontFamily: "Inter_700Bold", fontSize: 9 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
