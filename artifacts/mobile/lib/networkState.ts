/**
 * One app-wide NetInfo subscription shared by connectivity, data-mode, and
 * network-quality helpers. Keeping a single native listener avoids repeated
 * bridge callbacks on lower-memory Android devices.
 */
export type NativeNetworkState = {
  type?: string;
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
  details?: {
    cellularGeneration?: string | null;
    isConnectionExpensive?: boolean | null;
    [key: string]: unknown;
  } | null;
};

type NetworkStateListener = (state: NativeNetworkState) => void;

let currentState: NativeNetworkState | null = null;
let initializationAttempted = false;
let eventVersion = 0;
const listeners = new Set<NetworkStateListener>();

function publish(state: NativeNetworkState): void {
  currentState = state;
  listeners.forEach((listener) => {
    try { listener(state); } catch {}
  });
}

function initialize(): void {
  if (initializationAttempted) return;
  initializationAttempted = true;

  try {
    const NetInfo = require("@react-native-community/netinfo").default;
    const fetchVersion = eventVersion;
    NetInfo.addEventListener((state: NativeNetworkState) => {
      eventVersion += 1;
      publish(state);
    });
    NetInfo.fetch()
      .then((state: NativeNetworkState) => {
        // An event may arrive before fetch resolves. Do not overwrite that
        // newer state with a stale initial snapshot.
        if (eventVersion === fetchVersion) publish(state);
      })
      .catch(() => {});
  } catch {
    // Allow a later caller to retry if the native module was not ready yet.
    initializationAttempted = false;
  }
}

export function getNativeNetworkState(): NativeNetworkState | null {
  initialize();
  return currentState;
}

export function subscribeToNativeNetworkState(
  listener: NetworkStateListener,
): () => void {
  listeners.add(listener);
  initialize();
  if (currentState) {
    try { listener(currentState); } catch {}
  }
  return () => listeners.delete(listener);
}
