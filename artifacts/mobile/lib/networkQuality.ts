/**
 * networkQuality — Detect WiFi vs cellular and expose adaptive quality settings.
 *
 * Uses @react-native-community/netinfo (already installed).
 * All getters are synchronous and read from a cached value updated in the
 * background, so they can be called anywhere without async overhead.
 */

import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";

export type NetworkType = "wifi" | "cellular" | "unknown";

// Cached value — updated by the subscriber below
let _type: NetworkType = "unknown";
let _subscribed = false;

function ensureSubscribed() {
  if (_subscribed || Platform.OS === "web") return;
  _subscribed = true;
  NetInfo.fetch().then((s) => {
    _type = s.type === "wifi" ? "wifi" : s.type === "cellular" ? "cellular" : "unknown";
  });
  NetInfo.addEventListener((state) => {
    _type = state.type === "wifi" ? "wifi" : state.type === "cellular" ? "cellular" : "unknown";
  });
}

ensureSubscribed();

/** Current network type (synchronous, cached). */
export function getNetworkType(): NetworkType {
  if (Platform.OS === "web") return "wifi";
  return _type;
}

export function isWifi(): boolean {
  return getNetworkType() === "wifi";
}

export function isCellular(): boolean {
  return getNetworkType() === "cellular";
}

/**
 * Preferred video rendition height for current network.
 *  - WiFi      → 720p  (best quality)
 *  - Cellular  → 360p  (save 75%+ data vs 720p)
 *  - Unknown   → 480p  (safe middle ground)
 */
export function getPreferredVideoHeight(): 360 | 480 | 720 {
  if (Platform.OS === "web") return 720;
  const t = getNetworkType();
  if (t === "wifi") return 720;
  if (t === "cellular") return 360;
  return 480;
}

/**
 * Image upload/export quality for current network.
 *  - WiFi      → 0.85  (high quality)
 *  - Cellular  → 0.6   (saves ~30–40% file size)
 *  - Unknown   → 0.75
 */
export function getImageQuality(): number {
  if (Platform.OS === "web") return 0.85;
  const t = getNetworkType();
  if (t === "wifi") return 0.85;
  if (t === "cellular") return 0.6;
  return 0.75;
}

/**
 * Video export quality tier for expo-image-picker (iOS only).
 * Returns a number 0–1 mapping to VideoQuality enum values.
 *  - WiFi     → 0.7 (~720p)
 *  - Cellular → 0.3 (~480p)
 */
export function getVideoPickerQuality(): number {
  if (Platform.OS === "web") return 0.7;
  const t = getNetworkType();
  if (t === "wifi") return 0.7;
  if (t === "cellular") return 0.3;
  return 0.5;
}
