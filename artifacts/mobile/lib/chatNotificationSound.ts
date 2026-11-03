import { AppState, Platform } from "react-native";
import { getActiveChatId } from "@/lib/chatVisited";
import { isExpoGo } from "@/lib/expoEnvironment";

type ChatSound = import("expo-av/build/Audio/Sound").Sound;
type ExpoAudio = typeof import("expo-av").Audio;

let audioModule: ExpoAudio | null = null;
let loadedSound: ChatSound | null = null;
let loadingSound: Promise<ChatSound | null> | null = null;
const soundedMessages = new Map<string, number>();
const SOUND_SOURCE = require("../assets/sounds/incoming-message.wav");

function getAudioModule(): ExpoAudio | null {
  if (Platform.OS === "web" || isExpoGo()) return null;
  if (audioModule) return audioModule;
  try {
    audioModule = require("expo-av").Audio;
  } catch {
    return null;
  }
  return audioModule;
}

async function getSound(): Promise<ChatSound | null> {
  if (loadedSound) return loadedSound;
  if (loadingSound) return loadingSound;
  const audio = getAudioModule();
  if (!audio) return null;

  loadingSound = audio.Sound.createAsync(SOUND_SOURCE, {
    shouldPlay: false,
    volume: 0.22,
  })
    .then(({ sound }) => {
      loadedSound = sound as ChatSound;
      return loadedSound;
    })
    .catch(() => null)
    .finally(() => {
      loadingSound = null;
    });
  return loadingSound;
}

export function preloadIncomingMessageSound() {
  void getSound();
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
    const sound = await getSound();
    if (
      !sound ||
      AppState.currentState !== "active" ||
      getActiveChatId() !== chatId
    ) {
      return;
    }
    await sound.replayAsync();
  })().catch((error) => {
    if (__DEV__) console.warn("[chat] incoming-message sound failed", error);
  });
}
