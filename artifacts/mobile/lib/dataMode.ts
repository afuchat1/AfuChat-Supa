import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DataMode = "low" | "high";

type Listener = (mode: DataMode) => void;

const STORAGE_KEY = "afu_data_mode_override";

// Web always runs in high mode — no data saver on web.
let _mode: DataMode = Platform.OS === "web" ? "high" : "low";
let _isWifi: boolean = Platform.OS === "web";
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
  if (!state.isConnected) return "low";
  if (state.type === "cellular") return "low";
  if (state.details?.isConnectionExpensive) return "low";
  return "high";
}

export async function initDataMode() {
  if (_initialized) return;
  _initialized = true;

  // Web: always high — skip all network detection.
  if (Platform.OS === "web") {
    _isWifi = true;
    _mode = "high";
    return;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "low" || stored === "high") {
      _manualOverride = stored;
    } else if (stored === null) {
      _manualOverride = null;
    }
  } catch (_) {}

  try {
    const NetInfo = require("@react-native-community/netinfo").default;
    NetInfo.fetch().then((state: any) => {
      applyNetworkState(detectFromNetState(state));
    });
    NetInfo.addEventListener((state: any) => {
      applyNetworkState(detectFromNetState(state));
    });
  } catch (_) {}
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
  if (Platform.OS === "web") return; // no-op on web
  _manualOverride = mode;
  if (mode === null) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  }
  notify(getEffectiveMode());
}

export function subscribeDataMode(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
