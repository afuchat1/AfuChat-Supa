/**
 * AfuChat Sound Manager
 *
 * Plays the AfuChat branded notification sound in-app (foreground).
 * Supports three user-selectable sound modes:
 *   "afuchat" — custom branded sound (notification.wav)
 *   "device"  — silent here; OS plays push sound via system channel
 *   "silent"  — no sound (vibration only)
 *
 * Uses expo-av (Audio) for Expo Go compatibility. Non-critical — errors are swallowed.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SOUND_MODE_KEY = "@afuchat:sound_mode";
export type SoundMode = "afuchat" | "device" | "silent";

let _sound: any = null;
let _loading = false;

async function ensureSound(): Promise<any | null> {
  if (_sound) return _sound;
  if (_loading) return null;
  _loading = true;
  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: false,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      require("../assets/sounds/notification.wav"),
      { shouldPlay: false, volume: 1.0 }
    );
    _sound = sound;
    return _sound;
  } catch {
    return null;
  } finally {
    _loading = false;
  }
}

// ── Sound mode preference ─────────────────────────────────────────────

let _cachedMode: SoundMode | null = null;

export async function getSoundMode(): Promise<SoundMode> {
  if (_cachedMode) return _cachedMode;
  try {
    const stored = await AsyncStorage.getItem(SOUND_MODE_KEY);
    _cachedMode = (stored as SoundMode) || "afuchat";
  } catch {
    _cachedMode = "afuchat";
  }
  return _cachedMode!;
}

export async function setSoundMode(mode: SoundMode): Promise<void> {
  _cachedMode = mode;
  try {
    await AsyncStorage.setItem(SOUND_MODE_KEY, mode);
  } catch {}
}

// ── Playback ──────────────────────────────────────────────────────────

export async function playNotificationSound(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mode = await getSoundMode();
    if (mode === "silent" || mode === "device") return;
    const sound = await ensureSound();
    if (!sound) return;
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Non-critical — never break the app for a sound
  }
}

export function preloadNotificationSound(): void {
  if (Platform.OS !== "web") {
    ensureSound().catch(() => {});
  }
}

/**
 * Returns the Expo push API sound value based on the user's preference.
 * Used when building push notification payloads.
 */
export async function getPushSoundToken(): Promise<string | null> {
  const mode = await getSoundMode();
  if (mode === "silent") return null;
  if (mode === "device") return "default";
  return "notification.wav";
}
