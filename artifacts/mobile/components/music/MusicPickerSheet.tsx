import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { showAlert } from "@/lib/alert";
import { getMusicTrackById, listMusicTracks, purchaseMusicTrack } from "@/lib/afuMusic";
import { useAfuMusicPlayer } from "@/modules/afumusic/MusicPlayerContext";
import type { AfuMusicTrack } from "@/modules/afumusic";
import AfuMusicArtwork from "@/components/music/AfuMusicArtwork";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: AfuMusicTrack) => void;
  selectedTrackId?: string | null;
  purpose?: "video" | "post";
};

const COLORS = {
  ink: "#19172F",
  coral: "#F06451",
  canvas: "#F7F1E9",
  paper: "#FFF9F1",
  muted: "#8D847B",
  green: "#2F9B70",
};

export default function MusicPickerSheet({ visible, onClose, onSelect, selectedTrackId, purpose = "video" }: Props) {
  const { user, profile } = useAuth();
  const player = useAfuMusicPlayer();
  const [tracks, setTracks] = useState<AfuMusicTrack[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const balance = Math.max(0, Math.floor(Number(profile?.acoin ?? 0)));

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setLoadError(false);
    listMusicTracks()
      .then((result) => {
        if (active) setTracks(purpose === "video" ? result.filter((track) => track.videoUseAllowed) : result);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [purpose, visible]);

  const filteredTracks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tracks;
    return tracks.filter((track) =>
      `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(needle)
    );
  }, [query, tracks]);

  const preview = (track: AfuMusicTrack) => {
    if (!user) {
      router.push("/(auth)/login" as any);
      return;
    }
    if (track.price > 0 && !track.isOwned) {
      showAlert("Track is locked", `Buy this track for ${track.price} ACoin before previewing or adding it to a video.`);
      return;
    }
    player.play(track, [track], "Video music preview", { source: "shot", showPlayer: false })
      .catch((error) => showAlert("Preview unavailable", error));
  };

  const choose = async (track: AfuMusicTrack) => {
    if (!user) {
      router.push("/(auth)/login" as any);
      return;
    }
    if (purpose === "post" || track.price === 0 || track.isOwned) {
      onSelect(track);
      return;
    }

    const purchase = async () => {
      setBusyTrackId(track.id);
      try {
        await purchaseMusicTrack(track.id);
        const fresh = await getMusicTrackById(track.id);
        if (!fresh || !fresh.isOwned) throw new Error("The purchase completed, but the track is not available yet.");
        setTracks((current) => current.map((item) => item.id === fresh.id ? fresh : item));
        onSelect(fresh);
      } catch (error) {
        showAlert("Purchase could not be completed", error);
      } finally {
        setBusyTrackId(null);
      }
    };

    showAlert(
      "Unlock licensed video music",
      `${track.title} by ${track.artist}\nPrice: ${track.price} ACoin · Your balance: ${balance} ACoin\n\nThe creator allows this track in AfuChat videos. Buying the track grants access to this in-app use.`,
      balance >= track.price
        ? [
            { text: "Cancel", style: "cancel" },
            { text: `Buy for ${track.price} ACoin`, onPress: purchase },
          ]
        : [
            { text: "Not now", style: "cancel" },
            { text: "Open AfuPay", onPress: () => router.push("/app/afupay" as any) },
          ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{purpose === "video" ? "AFUMUSIC LICENSED LIBRARY" : "AFUMUSIC CATALOG"}</Text>
              <Text style={styles.title}>{purpose === "video" ? "Add music to video" : "Attach a track"}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close music picker">
              <Ionicons name="close" size={23} color={COLORS.ink} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={17} color={COLORS.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search tracks, creators, genres"
              placeholderTextColor={COLORS.muted}
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
          <Text style={styles.rightsNote}>
            {purpose === "video"
              ? "Only tracks explicitly cleared by their creators for AfuChat video use appear here."
              : "Attach a canonical track card. Paid tracks stay locked to listeners until they purchase access."}
          </Text>
          {loading ? (
            <View style={styles.center}><ActivityIndicator color={COLORS.coral} /><Text style={styles.emptyCopy}>Loading music…</Text></View>
          ) : loadError ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={29} color={COLORS.coral} />
              <Text style={styles.emptyTitle}>Music could not be loaded</Text>
              <Text style={styles.emptyCopy}>Check your connection and open the music picker again.</Text>
            </View>
          ) : filteredTracks.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="musical-notes-outline" size={30} color={COLORS.muted} />
              <Text style={styles.emptyTitle}>{tracks.length ? "No matching tracks" : "No video-cleared tracks yet"}</Text>
              <Text style={styles.emptyCopy}>{tracks.length ? "Try another title, artist, or genre." : purpose === "video" ? "Creators can allow video use when they publish in AfuMusic Studio." : "Published tracks will appear here."}</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
              {filteredTracks.map((track) => {
                const owned = track.price === 0 || !!track.isOwned;
                const selected = track.id === selectedTrackId;
                const busy = busyTrackId === track.id;
                return (
                  <View key={track.id} style={[styles.row, selected && styles.rowSelected]}>
                    <AfuMusicArtwork
                      uri={track.coverArtUrl}
                      size={42}
                      radius={12}
                      iconColor={COLORS.ink}
                      backgroundColor={COLORS.paper}
                      style={styles.art}
                      accessibilityLabel={`${track.title} cover art`}
                    />
                    <View style={styles.rowCopy}>
                      <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.trackArtist} numberOfLines={1}>{track.artist} · {track.genre}</Text>
                      <Text style={[styles.trackPrice, { color: owned ? COLORS.green : COLORS.coral }]}>
                        {track.price === 0 ? "Free" : owned ? `Owned · ${track.price} ACoin` : `${track.price} ACoin`}
                      </Text>
                    </View>
                    <Pressable onPress={() => preview(track)} hitSlop={8} accessibilityLabel={`Preview ${track.title}`}>
                      <Ionicons name="play-circle-outline" size={25} color={COLORS.ink} />
                    </Pressable>
                    <Pressable
                      onPress={() => { void choose(track); }}
                      disabled={busy}
                      style={[styles.chooseButton, selected && styles.chooseButtonSelected]}
                      accessibilityLabel={owned ? `Use ${track.title} in this video` : `Buy and use ${track.title}`}
                    >
                      {busy ? <ActivityIndicator size="small" color={COLORS.paper} /> : (
                        <Text style={styles.chooseText}>{selected ? "Added" : owned ? "Use" : "Buy"}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(25,23,47,0.48)" },
  sheet: { maxHeight: "88%", minHeight: "56%", paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, borderTopLeftRadius: 27, borderTopRightRadius: 27, backgroundColor: COLORS.canvas },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: "#D4C7BC", alignSelf: "center", marginBottom: 15 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 13 },
  kicker: { color: COLORS.coral, fontFamily: "Inter_700Bold", fontSize: 8, letterSpacing: 1.3 },
  title: { color: COLORS.ink, fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 3 },
  search: { height: 43, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 13, backgroundColor: COLORS.paper },
  searchInput: { flex: 1, color: COLORS.ink, fontFamily: "Inter_500Medium", fontSize: 12 },
  rightsNote: { color: COLORS.muted, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 15, marginTop: 10, marginBottom: 4 },
  list: { gap: 8, paddingTop: 8, paddingBottom: 16 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 15, backgroundColor: COLORS.paper },
  rowSelected: { borderWidth: 1, borderColor: COLORS.coral },
  art: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: COLORS.ink, fontFamily: "Inter_700Bold", fontSize: 11 },
  trackArtist: { color: COLORS.muted, fontFamily: "Inter_500Medium", fontSize: 9, marginTop: 3 },
  trackPrice: { fontFamily: "Inter_600SemiBold", fontSize: 9, marginTop: 3 },
  chooseButton: { minWidth: 43, height: 33, alignItems: "center", justifyContent: "center", paddingHorizontal: 9, borderRadius: 10, backgroundColor: COLORS.coral },
  chooseButtonSelected: { backgroundColor: COLORS.green },
  chooseText: { color: COLORS.paper, fontFamily: "Inter_700Bold", fontSize: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 22 },
  emptyTitle: { color: COLORS.ink, fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "center" },
  emptyCopy: { color: COLORS.muted, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, textAlign: "center" },
});
