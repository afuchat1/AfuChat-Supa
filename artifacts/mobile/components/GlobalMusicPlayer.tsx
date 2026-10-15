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
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const playMusic = useCallback((track: AfuMusicTrack, uri: string) => {
    setActiveMusic({ track, uri });
    setExpanded(false);
    setMinimized(false);
  }, []);
  const stopMusic = useCallback(() => { setActiveMusic(null); setExpanded(false); setMinimized(false); }, []);
  const value = useMemo(() => ({ activeMusic, playMusic, stopMusic }), [activeMusic, playMusic, stopMusic]);

  return (
    <GlobalMusicContext.Provider value={value}>
      {children}
      {activeMusic ? (
        <View pointerEvents="box-none" style={[styles.overlay, { bottom: Math.max(insets.bottom, 8) + 68 }]}>
          <View style={[styles.player, minimized && styles.playerMinimized, expanded && styles.playerExpanded]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded ? "Current song details" : "Open current song"}
              onPress={() => { setExpanded((value) => !value); setMinimized(false); }}
              style={styles.trackHeader}
            >
              <View style={[styles.art, { backgroundColor: activeMusic.track.coverColor || "#19172F" }, minimized && styles.artMinimized]}>
                <Ionicons name="musical-notes" size={minimized ? 15 : 18} color={activeMusic.track.accentColor || "#F06451"} />
              </View>
              <View style={styles.trackCopy}>
                <Text numberOfLines={1} style={styles.trackTitle}>{activeMusic.track.title}</Text>
                {!minimized && <Text numberOfLines={1} style={styles.artist}>{activeMusic.track.artist}</Text>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={minimized ? "Expand mini player" : "Minimize player"} onPress={() => { setExpanded(false); setMinimized((value) => !value); }} hitSlop={8} style={styles.action}>
                <Ionicons name={minimized ? "chevron-up" : "chevron-down"} size={19} color="#6B7280" />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop music" onPress={stopMusic} hitSlop={8} style={styles.action}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </Pressable>
            <View pointerEvents={minimized ? "none" : "auto"} style={minimized ? styles.hiddenControls : styles.controls}>
              <AudioPlayer
                key={activeMusic.track.id}
                uri={activeMusic.uri}
                tintColor="#19172F"
                waveColor="#1F95FF"
                autoPlay
              />
            </View>
            {expanded && !minimized ? (
              <View style={styles.songSheet}>
                <View style={[styles.largeArt, { backgroundColor: activeMusic.track.coverColor || "#19172F" }]}>
                  <Ionicons name="musical-notes" size={42} color={activeMusic.track.accentColor || "#F06451"} />
                </View>
                <Text numberOfLines={2} style={styles.sheetTitle}>{activeMusic.track.title}</Text>
                <Text numberOfLines={1} style={styles.sheetArtist}>{activeMusic.track.artist}</Text>
                <Text style={styles.sheetHint}>Now playing on AfuChat</Text>
              </View>
            ) : null}
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
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D8DCE3",
  },
  playerMinimized: { paddingVertical: 4, gap: 0 },
  playerExpanded: { paddingTop: 10, paddingBottom: 14 },
  action: { padding: 4 },
  controls: { opacity: 1 },
  hiddenControls: { height: 0, opacity: 0, overflow: "hidden" },
  artMinimized: { width: 30, height: 30 },
  songSheet: { alignItems: "center", paddingTop: 14, paddingBottom: 6 },
  largeArt: { width: 150, height: 150, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  sheetTitle: { color: "#19172F", fontSize: 17, fontWeight: "700", textAlign: "center", maxWidth: "95%" },
  sheetArtist: { color: "#6B7280", fontSize: 13, marginTop: 5 },
  sheetHint: { color: "#1F95FF", fontSize: 11, marginTop: 10 },
  trackHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
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
  close: { padding: 3 },
});
