import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DataMode = "low" | "high";

type Listener = (mode: DataMode) => void;

const STORAGE_KEY = "afu_data_mode_override";

let _mode: DataMode = "high";
let _manualOverride: DataMode | null = null;
let _listeners: Listener[] = [];
let _initialized = false;

function notify(mode: DataMode) {
  if (mode === _mode) return;
  _mode = mode;
  _listeners.forEach((fn) => fn(mode));
}

function applyAutoMode(detected: DataMode) {
  if (_manualOverride !== null) return;
  notify(detected);
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

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "low" || stored === "high") {
      _manualOverride = stored;
      _mode = stored;
      _listeners.forEach((fn) => fn(_mode));
    }
  } catch (_) {}

  if (Platform.OS === "web") {
    try {
      const nav = navigator as any;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn) {
        const check = () => {
          const isLow =
            conn.saveData ||
            conn.effectiveType === "slow-2g" ||
            conn.effectiveType === "2g" ||
            conn.effectiveType === "3g";
          applyAutoMode(isLow ? "low" : "high");
        };
        check();
        conn.addEventListener("change", () => {
          const isLow =
            conn.saveData ||
            conn.effectiveType === "slow-2g" ||
            conn.effectiveType === "2g" ||
            conn.effectiveType === "3g";
          applyAutoMode(isLow ? "low" : "high");
        });
      }
    } catch (_) {}
    return;
  }

  try {
    const NetInfo = require("@react-native-community/netinfo").default;
    NetInfo.fetch().then((state: any) => {
      applyAutoMode(detectFromNetState(state));
    });
    NetInfo.addEventListener((state: any) => {
      applyAutoMode(detectFromNetState(state));
    });
  } catch (_) {}
}

export function getCurrentDataMode(): DataMode {
  return _mode;
}

export function getManualOverride(): DataMode | null {
  return _manualOverride;
}

export async function setManualDataMode(mode: DataMode | null) {
  _manualOverride = mode;
  if (mode === null) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
    notify(mode);
  }
}

export function subscribeDataMode(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
