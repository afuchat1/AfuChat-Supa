/**
 * networkQuality — Detect WiFi vs cellular and expose adaptive quality settings.
 *
 * Uses @react-native-community/netinfo (already installed).
 * All getters are synchronous and read from a cached value updated in the
 * background, so they can be called anywhere without async overhead.
 */

import NetInfo from "@react-native-community/netinfo";

export type NetworkType = "wifi" | "cellular" | "unknown";

// Cached value — updated by the subscriber below
let _type: NetworkType = "unknown";
let _connected: boolean | null = null;
let _subscribed = false;

function ensureSubscribed() {
  if (_subscribed) return;
  _subscribed = true;
  NetInfo.fetch().then((s) => {
    _type = s.type === "wifi" ? "wifi" : s.type === "cellular" ? "cellular" : "unknown";
    _connected = s.isConnected;
  });
  NetInfo.addEventListener((state) => {
    _type = state.type === "wifi" ? "wifi" : state.type === "cellular" ? "cellular" : "unknown";
    _connected = state.isConnected;
  });
}

/** Current network type (synchronous, cached). */
export function getNetworkType(): NetworkType {
  // Do not touch NetInfo during module evaluation. Release Android can import
  // this helper as part of the startup bundle before the native bridge is
  // ready; lazy subscription keeps cold boot cheap and avoids a second
  // eager NetInfo listener competing with offlineStore.
  ensureSubscribed();
  return _type;
}

export function isWifi(): boolean {
  return getNetworkType() === "wifi";
}

export function isCellular(): boolean {
  return getNetworkType() === "cellular";
}

/**
 * Returns true when the device has no internet connection.
 * Uses the cached NetInfo state — zero async overhead.
 * On web always returns false (browser handles connectivity itself).
 */
export function isOffline(): boolean {
  // _connected starts as null (not yet known) — treat as online until proven otherwise
  return _connected === false;
}

/**
 * Subscribe to connectivity changes.
 * Calls `callback(offline)` immediately on the next NetInfo event.
 * Returns an unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeToNetworkChanges(callback: (offline: boolean) => void): () => void {
  ensureSubscribed();
  const unsub = NetInfo.addEventListener((state) => {
    callback(state.isConnected === false);
  });
  return unsub;
}

/**
 * Preferred video rendition height for current network.
 *  - WiFi      → 720p  (best quality)
 *  - Cellular  → 360p  (save 75%+ data vs 720p)
 *  - Unknown   → 480p  (safe middle ground)
 */
export function getPreferredVideoHeight(): 360 | 480 | 720 {
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
  const t = getNetworkType();
  if (t === "wifi") return 0.85;
  if (t === "cellular") return 0.6;
  return 0.75;
}

/**
 * Video export quality tier for expo-image-picker (iOS only).
 * Delegates to videoCompression.ts which owns all quality presets.
 * Kept here for backwards-compat imports.
 */
export function getVideoPickerQuality(): number {
  // Inline the logic to avoid circular imports (videoCompression imports networkQuality)
  const t = getNetworkType();
  if (t === "wifi")     return 0.5;   // was 0.7 → now ~640p → ~50% smaller uploads
  if (t === "cellular") return 0.25;  // was 0.3 → now ~360p → ~70% smaller uploads
  return 0.4;                         // was 0.5 → now ~480p → ~60% smaller uploads
}
