/**
 * networkQuality — Detect WiFi vs cellular and expose adaptive quality settings.
 *
 * Uses @react-native-community/netinfo (already installed).
 * All getters are synchronous and read from a cached value updated in the
 * background, so they can be called anywhere without async overhead.
 */

import NetInfo from "@react-native-community/netinfo";

export type NetworkType = "wifi" | "cellular" | "unknown";
export type NetworkProfile = {
  type: NetworkType;
  connected: boolean | null;
  cellularGeneration: string | null;
  expensive: boolean | null;
};

// Cached value — updated by the subscriber below
let _type: NetworkType = "unknown";
let _connected: boolean | null = null;
let _cellularGeneration: string | null = null;
let _expensive: boolean | null = null;
let _subscribed = false;
const _profileListeners = new Set<(profile: NetworkProfile) => void>();

function snapshot(): NetworkProfile {
  return {
    type: _type,
    connected: _connected,
    cellularGeneration: _cellularGeneration,
    expensive: _expensive,
  };
}

function updateFromState(state: any): void {
  _type = state.type === "wifi" ? "wifi" : state.type === "cellular" ? "cellular" : "unknown";
  _connected = state.isConnected ?? null;
  _cellularGeneration = _type === "cellular"
    ? (state.details?.cellularGeneration ?? null)
    : null;
  _expensive = typeof state.details?.isConnectionExpensive === "boolean"
    ? state.details.isConnectionExpensive
    : null;
  const current = snapshot();
  _profileListeners.forEach((listener) => {
    try { listener(current); } catch {}
  });
}

function ensureSubscribed() {
  if (_subscribed) return;
  _subscribed = true;
  NetInfo.fetch().then(updateFromState).catch(() => {});
  NetInfo.addEventListener(updateFromState);
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

/** Current cached network profile. No probe or network request is made. */
export function getNetworkProfile(): NetworkProfile {
  ensureSubscribed();
  return snapshot();
}

/** Subscribe to changes in Wi-Fi/cellular generation and metering state. */
export function subscribeToNetworkProfileChanges(
  callback: (profile: NetworkProfile) => void,
): () => void {
  ensureSubscribed();
  _profileListeners.add(callback);
  callback(snapshot());
  return () => _profileListeners.delete(callback);
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
 * Conservative video rendition height. Unknown and metered connections avoid
 * high-resolution sources until NetInfo confirms an unmetered Wi-Fi network.
 */
export function getPreferredVideoHeight(profile = getNetworkProfile()): 240 | 360 | 720 {
  if (profile.type === "wifi" && profile.expensive !== true) return 720;
  if (profile.type === "cellular" && profile.cellularGeneration === "2g") return 240;
  return 360;
}

/** Maximum preferred rendition bitrate; source selection still respects height. */
export function getPreferredVideoMaxBitrateKbps(profile = getNetworkProfile()): number {
  if (profile.type === "wifi" && profile.expensive !== true) return 4_000;
  if (profile.type === "cellular") {
    if (profile.cellularGeneration === "2g") return 400;
    if (profile.cellularGeneration === "3g") return 700;
    if (profile.cellularGeneration === "5g") return 1_500;
    return 1_000;
  }
  return 650;
}

/** Only warm the next video on Wi-Fi; never prefetch on cellular/unknown. */
export function shouldPreloadAdjacentVideo(profile = getNetworkProfile()): boolean {
  return profile.type === "wifi" && profile.connected !== false && profile.expensive !== true;
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
