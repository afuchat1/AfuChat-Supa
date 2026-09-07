import { Platform } from "react-native";

type MediaPlayer = {
  play?: () => unknown;
  pause?: () => unknown;
  playing?: boolean;
  addListener?: (...args: any[]) => { remove?: () => void } | void;
};

type WebMediaState = {
  playRequested: boolean;
  pauseListener?: { remove?: () => void };
  pauseTimeout?: ReturnType<typeof setTimeout>;
};

const webMediaState = new WeakMap<object, WebMediaState>();

function safelyInvoke(action?: () => unknown) {
  try {
    const result = action?.();
    if (result && typeof (result as { catch?: unknown }).catch === "function") {
      void Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Media can be unavailable while a source is loading or unmounting.
  }
}

function getWebMediaState(player: MediaPlayer): WebMediaState {
  const key = player as object;
  const existing = webMediaState.get(key);
  if (existing) return existing;
  const created: WebMediaState = { playRequested: false };
  webMediaState.set(key, created);
  return created;
}

function clearPauseWaiter(state: WebMediaState) {
  state.pauseListener?.remove?.();
  state.pauseListener = undefined;
  if (state.pauseTimeout) {
    clearTimeout(state.pauseTimeout);
    state.pauseTimeout = undefined;
  }
}

export function safePlay(player: MediaPlayer | null | undefined) {
  if (Platform.OS === "web" && player) {
    const state = getWebMediaState(player);
    clearPauseWaiter(state);
    state.playRequested = true;
    if (player.playing) return;
  }
  safelyInvoke(() => player?.play?.());
}

export function safePause(player: MediaPlayer | null | undefined) {
  if (Platform.OS === "web" && player) {
    const state = getWebMediaState(player);
    if (player.playing) {
      state.playRequested = false;
      safelyInvoke(() => player.pause?.());
      return;
    }

    // expo-video's web adapter calls HTMLMediaElement.play() without
    // returning its promise. Pausing while that request is pending makes
    // browsers reject it as an unhandled "play() request was interrupted"
    // error. Wait for the adapter's playing event, then pause after play has
    // settled. If no play request is pending, the player is already paused.
    if (!state.playRequested) return;
    clearPauseWaiter(state);
    state.pauseListener = (player.addListener?.("playingChange", (event: { isPlaying?: boolean }) => {
      if (!event?.isPlaying) return;
      clearPauseWaiter(state);
      state.playRequested = false;
      safelyInvoke(() => player.pause?.());
    }) ?? undefined) as { remove?: () => void } | undefined;
    state.pauseTimeout = setTimeout(() => {
      clearPauseWaiter(state);
      state.playRequested = false;
    }, 2000);
    return;
  }
  safelyInvoke(() => player?.pause?.());
}