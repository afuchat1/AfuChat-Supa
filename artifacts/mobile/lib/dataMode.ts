import { Platform } from "react-native";

export type DataMode = "low" | "high";

type Listener = (mode: DataMode) => void;

let _mode: DataMode = "high";
let _listeners: Listener[] = [];
let _initialized = false;

function notify(mode: DataMode) {
  if (mode === _mode) return;
  _mode = mode;
  _listeners.forEach((fn) => fn(mode));
}

function detectFromNetState(state: any): DataMode {
  if (!state.isConnected) return "low";
  if (state.type === "cellular") return "low";
  if (state.details?.isConnectionExpensive) return "low";
  return "high";
}

export function initDataMode() {
  if (_initialized) return;
  _initialized = true;

  if (Platform.OS === "web") {
    try {
      const nav = navigator as any;
      const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
      if (conn) {
        const check = () => {
          const isLow = conn.saveData ||
            conn.effectiveType === "slow-2g" ||
            conn.effectiveType === "2g" ||
            conn.effectiveType === "3g";
          _mode = isLow ? "low" : "high";
        };
        check();
        conn.addEventListener("change", () => {
          const isLow = conn.saveData ||
            conn.effectiveType === "slow-2g" ||
            conn.effectiveType === "2g" ||
            conn.effectiveType === "3g";
          notify(isLow ? "low" : "high");
        });
      }
    } catch (_) {}
    return;
  }

  try {
    const NetInfo = require("@react-native-community/netinfo").default;
    NetInfo.fetch().then((state: any) => {
      _mode = detectFromNetState(state);
    });
    NetInfo.addEventListener((state: any) => {
      notify(detectFromNetState(state));
    });
  } catch (_) {}
}

export function getCurrentDataMode(): DataMode {
  return _mode;
}

export function subscribeDataMode(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}
