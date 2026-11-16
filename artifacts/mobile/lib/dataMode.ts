import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeToNativeNetworkState } from "./networkState";

export type DataMode = "low" | "high";

type Listener = (mode: DataMode) => void;

const STORAGE_KEY = "afu_data_mode_override";

// Native NetInfo is asynchronous. Start with the unrestricted mode so a
// connected release build does not throttle its first feed/media requests
// while the initial network classification is still in flight.
let _mode: DataMode = "high";
let _isWifi = true;
let _manualOverride: DataMode | null = null;
let _listeners: Listener[] = [];
let _initialized = false;

function getEffectiveMode(): DataMode {
  if (_isWifi) return "high";
  return _manualOverride ?? "low";
}

function notify(newMode: DataMode) {
  if (newMode === _mode) return;
  _mode = newMode;
  _listeners.forEach((fn) => fn(newMode));
}

function applyNetworkState(detected: DataMode) {
  _isWifi = detected === "high";
  notify(getEffectiveMode());
}

function detectFromNetState(state: any): DataMode {
  // NetInfo reports `null` while the native connectivity probe is still
  // resolving. Treat that short window as unrestricted so a connected release
  // build does not enter cache-only/low-data behavior during startup.
  if (state.isConnected === false) return "low";
  if (state.isConnected !== true) return "high";
  if (state.type === "cellular") return "low";
  if (state.details?.isConnectionExpensive) return "low";
  return "high";
}

export async function initDataMode() {
  if (_initialized) return;
  _initialized = true;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "low" || stored === "high") {
      _manualOverride = stored;
    } else if (stored === null) {
      _manualOverride = null;
    }
  } catch (_) {}

  subscribeToNativeNetworkState((state) => {
    applyNetworkState(detectFromNetState(state));
  });
}

export function getCurrentDataMode(): DataMode {
  return _mode;
}

export function getManualOverride(): DataMode | null {
  return _manualOverride;
}

export function getIsWifi(): boolean {
  return _isWifi;
}

export async function setManualDataMode(mode: DataMode | null) {
  _manualOverride = mode;
  try {
    if (mode === null) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {}
  notify(getEffectiveMode());
}

export function subscribeDataMode(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
