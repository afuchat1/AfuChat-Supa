export type ConnectivityPhase = "offline" | "connecting" | "online";
export type OfflineBannerState = ConnectivityPhase | "updating" | "hidden";

export function resolveConnectivityPhase(input: {
  transportConnected: boolean | null;
  internetReachable: boolean | null;
  backendReachable: boolean | null;
  browserOnline: boolean | null;
}): ConnectivityPhase {
  // A completed request is stronger evidence than a stale native reachability
  // probe, which can be inaccurate on some Android carriers.
  if (input.backendReachable === true) return "online";

  const transportConnected = input.transportConnected ?? input.browserOnline;
  if (transportConnected === false) return "offline";
  if (input.backendReachable === false) return "connecting";
  if (input.internetReachable === true || input.browserOnline === true) return "online";
  return "connecting";
}

export function resolveOfflineBannerState(
  phase: ConnectivityPhase,
  dataSyncActive: boolean,
): OfflineBannerState {
  if (phase !== "online") return phase;
  return dataSyncActive ? "updating" : "hidden";
}
