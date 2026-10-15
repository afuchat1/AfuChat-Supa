import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AudioPlayer from "@/components/AudioPlayer";
import type { AfuMusicTrack } from "@/modules/afumusic";

type ActiveMusic = { track: AfuMusicTrack; uri: string };
type GlobalMusicContextValue = {
  activeMusic: ActiveMusic | null;
  playMusic: (track: AfuMusicTrack, uri: string) => void;
  stopMusic: () => void;
};

const GlobalMusicContext = createContext<GlobalMusicContextValue | null>(null);

export function useGlobalMusicPlayer() {
  const context = useContext(GlobalMusicContext);
  if (!context) throw new Error("useGlobalMusicPlayer must be used inside GlobalMusicPlayerProvider");
  return context;
}

export function GlobalMusicPlayerProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [activeMusic, setActiveMusic] = useState<ActiveMusic | null>(null);

  const playMusic = useCallback((track: AfuMusicTrack, uri: string) => {
    setActiveMusic({ track, uri });
  }, []);
  const stopMusic = useCallback(() => setActiveMusic(null), []);
  const value = useMemo(() => ({ activeMusic, playMusic, stopMusic }), [activeMusic, playMusic, stopMusic]);

  return (
    <GlobalMusicContext.Provider value={value}>
      {children}
      {activeMusic ? (
        <View pointerEvents="box-none" style={[styles.overlay, { bottom: Math.max(insets.bottom, 8) + 68 }]}>
          <View style={styles.player}>
            <View style={[styles.art, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
              <Ionicons name="musical-notes" size={18} color={activeMusic.track.accentColor || "#F06451"} />
            </View>
            <View style={styles.trackCopy}>
              <Text numberOfLines={1} style={styles.trackTitle}>{activeMusic.track.title}</Text>
              <Text numberOfLines={1} style={styles.artist}>{activeMusic.track.artist}</Text>
            </View>
            <View style={styles.controls}>
              <AudioPlayer
                key={activeMusic.track.id}
                uri={activeMusic.uri}
                tintColor="#19172F"
                waveColor="#1F95FF"
                autoPlay
              />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop music" onPress={stopMusic} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={18} color="#6B7280" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </GlobalMusicContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 10,
    right: 10,
    zIndex: 1000,
    elevation: 12,
  },
  player: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D8DCE3",
  },
  art: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  trackCopy: { flex: 1, minWidth: 55 },
  trackTitle: { color: "#19172F", fontSize: 12, fontWeight: "700" },
  artist: { color: "#6B7280", fontSize: 11, marginTop: 2 },
  controls: { maxWidth: 175 },
  close: { padding: 3 },
});
