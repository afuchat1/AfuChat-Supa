/**
 * Global JS error handler — catches fatal JS errors that occur outside of
 * React's render cycle (i.e. in event handlers, setInterval, native callbacks)
 * and are NOT caught by the <ErrorBoundary>. Without this, those errors
 * crash the app to the OS on release builds with no visible feedback.
 *
 * What this does:
 *  1. Persists the crash details to AsyncStorage so the ErrorFallback screen
 *     can show them on the NEXT launch under "Previous crash".
 *  2. In DEBUG builds: calls the original handler so the red error overlay
 *     still appears for developers.
 *  3. In RELEASE builds: calls the original handler which triggers the
 *     React Native error screen (if any) — giving the user something to see.
 *
 * NOTE: This does NOT prevent the app from terminating on truly fatal errors.
 * It only captures the log before the OS kills the process.
 */
if (typeof ErrorUtils !== "undefined") {
  const _origHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    try {
      // Lazy-import to avoid pulling AsyncStorage into the polyfill module
      // before React Native has fully initialised.
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default as
          import("@react-native-async-storage/async-storage").AsyncStorageStatic;

      // Rotate current → previous before writing the new entry.
      const CRASH_LOG_KEY = "afuchat_last_crash_log";
      const PREV_CRASH_KEY = "afuchat_prev_crash_log";

      AsyncStorage.getItem(CRASH_LOG_KEY)
        .then((prev) => {
          if (prev) return AsyncStorage.setItem(PREV_CRASH_KEY, prev);
        })
        .catch(() => {});

      const ts = new Date().toISOString();
      const log = [
        "════════════════════════════════════════════",
        "AfuChat Global Error Report",
        `Time     : ${ts}`,
        `Fatal    : ${String(isFatal ?? false)}`,
        `Dev mode : ${String(__DEV__)}`,
        "",
        "────────────────  Error  ───────────────────",
        error?.message ?? String(error),
        "",
        "────────────  JS Stack Trace  ──────────────",
        error?.stack ?? "(no stack)",
        "════════════════════════════════════════════",
      ].join("\n");

      AsyncStorage.setItem(CRASH_LOG_KEY, log).catch(() => {});
    } catch {}

    // Always invoke the original handler last.
    _origHandler(error, isFatal);
  });
}
