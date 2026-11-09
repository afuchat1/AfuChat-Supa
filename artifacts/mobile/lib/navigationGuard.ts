/**
 * navigationGuard.ts
 *
 * Patches the expo-router `router` singleton so every call to
 * router.push / router.replace / router.back across the entire app
 * is automatically deduplicated — a repeated call for the same action within
 * DUPLICATE_WINDOW_MS is silently dropped. Different destinations are allowed
 * through immediately so a quick, intentional tap never feels blocked.
 *
 * Import this module once as a side-effect at the top of the root
 * _layout.tsx and you're done. No changes needed at any call site.
 */
import { router } from "expo-router";

const DUPLICATE_WINDOW_MS = 250;

let _lastActionKey = "";
let _lastActionAt = 0;
let _lastClockValue = 0;

function monotonicNow(): number {
  const perfNow = globalThis.performance?.now;
  const current = typeof perfNow === "function" ? perfNow.call(globalThis.performance) : Date.now();
  _lastClockValue = Math.max(_lastClockValue, current);
  return _lastClockValue;
}

function acquire(actionKey: string): boolean {
  const now = monotonicNow();
  if (
    actionKey === _lastActionKey &&
    now - _lastActionAt < DUPLICATE_WINDOW_MS
  ) {
    return false;
  }
  _lastActionKey = actionKey;
  _lastActionAt = now;
  return true;
}

/** Call this to manually release early (e.g. after a back press). */
export function release(): void {
  _lastActionKey = "";
  _lastActionAt = 0;
}

function keyFor(kind: "push" | "replace" | "navigate" | "back", args: unknown[] = []): string {
  try {
    return `${kind}:${JSON.stringify(args)}`;
  } catch {
    // Navigation params should be serializable, but never let an unusual
    // object prevent the navigation call from reaching Expo Router.
    return kind;
  }
}

const _origPush    = router.push.bind(router);
const _origReplace = router.replace.bind(router);
const _origBack    = router.back.bind(router);
const _origNavigate = router.navigate.bind(router);
const _origCanGoBack = router.canGoBack.bind(router);

function runWithMountRetry(action: () => void, attempt = 0): void {
  try {
    action();
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (!message.includes("mounting") || attempt >= 8) {
      // Navigation can race with auth restoration, deep-link handling, or a
      // screen unmount. Never turn that race into a production app crash.
      // The caller can still retry from the next user action.
      if (__DEV__) console.warn("[navigation] ignored route transition error", e);
      return;
    }
    // Expo Router can receive a notification/deep-link action before the root
    // navigator finishes mounting. Retry that known race instead of dropping
    // the navigation or surfacing a native-looking red screen.
    setTimeout(() => runWithMountRetry(action, attempt + 1), 60);
  }
}

(router as any).push = (...args: Parameters<typeof router.push>) => {
  if (!acquire(keyFor("push", args))) return;
  runWithMountRetry(() => _origPush(...args));
};

(router as any).replace = (...args: Parameters<typeof router.replace>) => {
  if (!acquire(keyFor("replace", args))) return;
  runWithMountRetry(() => _origReplace(...args));
};

(router as any).back = () => {
  if (!acquire(keyFor("back"))) return;
  runWithMountRetry(() => {
    if (_origCanGoBack()) _origBack();
    else _origReplace("/(tabs)/chats" as any);
  });
};

(router as any).navigate = (...args: Parameters<typeof router.navigate>) => {
  if (!acquire(keyFor("navigate", args))) return;
  runWithMountRetry(() => _origNavigate(...args));
};
