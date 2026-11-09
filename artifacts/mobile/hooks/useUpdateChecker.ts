import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Checks Google Play directly through Play Core.
 *
 * No Supabase settings, remote version endpoint, or custom update server is
 * involved. Play Core decides whether an update is available and presents
 * Google's native flexible/immediate update flow.
 */
export function useUpdateChecker(): void {
  const checking = useRef(false);
  const lastCheckedAt = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android" || __DEV__) return;

    let mounted = true;

    const checkForUpdate = async (force = false) => {
      const now = Date.now();
      if (
        checking.current ||
        (!force && now - lastCheckedAt.current < CHECK_INTERVAL_MS)
      ) {
        return;
      }

      checking.current = true;
      lastCheckedAt.current = now;

      try {
        const PlayUpdates = await import("expo-in-app-updates");
        if (!mounted) return;

        const result = await PlayUpdates.checkForUpdate();
        if (!mounted || !result.updateAvailable) return;

        // Play Console priority >= 4 uses the immediate flow. Other updates
        // use the flexible flow and download while the user keeps using AfuChat.
        // The native module completes a downloaded flexible update.
        await PlayUpdates.startUpdate();
      } catch {
        // Update checks are best-effort and must never interrupt app startup.
        // Allow another attempt after one minute if Play Store was unavailable.
        lastCheckedAt.current = Date.now() - CHECK_INTERVAL_MS + 60_000;
      } finally {
        checking.current = false;
      }
    };

    const startupTimer = setTimeout(() => {
      void checkForUpdate(true);
    }, 3500);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void checkForUpdate();
      }
    });

    return () => {
      mounted = false;
      clearTimeout(startupTimer);
      appStateSubscription.remove();
    };
  }, []);
}
