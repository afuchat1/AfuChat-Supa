/**
 * Global polyfills — must be imported before any library code runs.
 *
 * WeakRef: Added to Hermes in later releases. Older Android devices running
 * builds that bundle an older Hermes version will crash with
 * "Property 'WeakRef' doesn't exist" when any library (e.g. React Navigation
 * v7, TanStack Query v5) tries to use it. This polyfill provides a non-weak
 * fallback: the target is held strongly, so it won't be garbage-collected,
 * but all API calls succeed and functionality is preserved.
 */
if (typeof WeakRef === "undefined") {
  (global as any).WeakRef = class WeakRef<T extends object> {
    private _target: T;
    constructor(target: T) {
      this._target = target;
    }
    deref(): T {
      return this._target;
    }
  };
}

/**
 * FinalizationRegistry polyfill — companion to WeakRef. Libraries that use
 * WeakRef often also use FinalizationRegistry. Hermes versions that lack
 * WeakRef also lack FinalizationRegistry. This no-op polyfill prevents
 * crashes; cleanup callbacks simply never fire (acceptable since GC-based
 * cleanup is always best-effort).
 */
if (typeof FinalizationRegistry === "undefined") {
  (global as any).FinalizationRegistry = class FinalizationRegistry<T> {
    constructor(_callback: (heldValue: T) => void) {}
    register(_target: object, _heldValue: T, _unregisterToken?: object): void {}
    unregister(_unregisterToken: object): boolean {
      return false;
    }
  };
}

/**
 * Fabric safety: React Native enables removeClippedSubviews by default on
 * Android. With large, dynamic lists this can race view recycling and make
 * Fabric attach a child that still belongs to the previous clipping parent:
 * "The specified child already has a parent."
 *
 * The app already uses bounded list windows and explicit pagination. Disabling
 * native clipping is the safer choice for release builds; it avoids a fatal
 * native exception while keeping virtualization active.
 */
try {
  const ReactNative = require("react-native") as typeof import("react-native");
  for (const ListComponent of [ReactNative.FlatList, ReactNative.SectionList]) {
    const component = ListComponent as typeof ListComponent & {
      defaultProps?: Record<string, unknown>;
    };
    component.defaultProps = {
      ...component.defaultProps,
      removeClippedSubviews: false,
    };
  }
} catch {}

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
