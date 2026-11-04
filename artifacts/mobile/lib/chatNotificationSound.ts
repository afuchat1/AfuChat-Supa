import { AppState, Platform } from "react-native";
import { getActiveChatId } from "@/lib/chatVisited";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";

let loadedSound: AudioPlayer | null = null;
const soundedMessages = new Map<string, number>();
const SOUND_SOURCE = require("../assets/sounds/incoming-message.wav");

function getSound(): AudioPlayer | null {
  if (Platform.OS === "web") return null;
  if (loadedSound) return loadedSound;
  try {
    loadedSound = createAudioPlayer(SOUND_SOURCE, { updateInterval: 250 });
    loadedSound.volume = 0.22;
  } catch {
    return null;
  }
  return loadedSound;
}

export function preloadIncomingMessageSound() {
  getSound();
}

export function playIncomingMessageSound(chatId: string, messageId: string) {
  if (
    !chatId ||
    !messageId ||
    Platform.OS === "web" ||
    AppState.currentState !== "active" ||
    getActiveChatId() !== chatId
  ) {
    return;
  }

  const now = Date.now();
  for (const [key, timestamp] of soundedMessages) {
    if (now - timestamp > 30_000) soundedMessages.delete(key);
  }
  const dedupeKey = `${chatId}:${messageId}`;
  if (soundedMessages.has(dedupeKey)) return;
  soundedMessages.set(dedupeKey, now);

  void (async () => {
    const sound = getSound();
    if (
      !sound ||
      AppState.currentState !== "active" ||
      getActiveChatId() !== chatId
    ) {
      return;
    }
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
    await sound.seekTo(0);
    sound.play();
  })().catch((error) => {
    if (__DEV__) console.warn("[chat] incoming-message sound failed", error);
  });
}
