/**
 * AfuChat Sound Manager
 * Plays the AfuChat branded notification sound in-app (foreground).
 * Uses expo-audio (SDK 54+) for reliable cross-platform audio playback.
 * Safe to call from anywhere — errors are silently swallowed (sound is non-critical).
 */
import { Platform } from "react-native";

let _player: any = null;
let _loading = false;

async function ensurePlayer(): Promise<any | null> {
  if (_player) return _player;
  if (_loading) return null;
  _loading = true;
  try {
    const { createAudioPlayer } = await import("expo-audio");
    _player = createAudioPlayer(
      require("../assets/sounds/notification.wav")
    );
    return _player;
  } catch {
    return null;
  } finally {
    _loading = false;
  }
}

export async function playNotificationSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const player = await ensurePlayer();
    if (!player) return;
    player.seekTo(0);
    player.play();
  } catch {
    // Non-critical — never break the app for a sound
  }
}

export function preloadNotificationSound(): void {
  if (Platform.OS !== "web") {
    ensurePlayer().catch(() => {});
  }
}
