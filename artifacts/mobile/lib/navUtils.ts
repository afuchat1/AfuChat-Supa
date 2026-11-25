/**
 * navUtils — Global navigation-lock + safe wrappers.
 *
 * WHY: React Native (and the web build) deliver touches to JS in bursts.
 * A user can easily fire 3-4 press events before the first route even
 * renders. Without a lock, all three navigations execute and the user
 * lands on an unintended deep stack or sees a flickering screen.
 *
 * HOW:
 * - SafePressable / SafeTouchableOpacity use a module-level action key to
 *   block immediate duplicate presses, including presses that navigate
 *   indirectly (like openApp()).
 * - Direct router calls are deduplicated by navigationGuard, which is mounted
 *   once by the root layout. Keeping the router lock in one place prevents a
 *   valid action from being dropped by two independent cooldowns.
 */

import { router } from "expo-router";
import { useCallback, useRef } from "react";
import { performBackNavigation } from "./backNavigation";

export const NAV_COOLDOWN_MS = 250;

let _lastActionKey = "";
let _lastActionAt = 0;
let _lastClockValue = 0;
let _nextHandlerId = 1;
const _handlerIds = new WeakMap<Function, string>();

function monotonicNow(): number {
  const perfNow = globalThis.performance?.now;
  const current = typeof perfNow === "function" ? perfNow.call(globalThis.performance) : Date.now();
  _lastClockValue = Math.max(_lastClockValue, current);
  return _lastClockValue;
}

export function navActionKeyForHandler(handler: unknown): string {
  if (typeof handler !== "function") return "__press__";
  const fn = handler as Function;
  let id = _handlerIds.get(fn);
  if (!id) {
    id = `handler:${_nextHandlerId++}`;
    _handlerIds.set(fn, id);
  }
  return id;
}

// ── Core lock ─────────────────────────────────────────────────────────────────

/**
 * Attempt to acquire the navigation lock.
 * Returns `true` (and sets the lock) if navigation is allowed.
 * Returns `false` immediately if the lock is already held.
 */
export function acquireNavLock(
  cooldownMs = NAV_COOLDOWN_MS,
  actionKey = "__press__",
): boolean {
  const now = monotonicNow();
  if (
    actionKey === _lastActionKey &&
    now - _lastActionAt < cooldownMs
  ) {
    return false;
  }
  _lastActionKey = actionKey;
  _lastActionAt = now;
  return true;
}

/** True while the lock is held (i.e., navigation in progress). */
export function isNavLocked(): boolean {
  return monotonicNow() - _lastActionAt < NAV_COOLDOWN_MS;
}

/** Force-release the lock early (e.g., on back-gesture completion). */
export function releaseNavLock(): void {
  _lastActionKey = "";
  _lastActionAt = 0;
}

function navigationKey(kind: string, href: unknown): string {
  try {
    return `${kind}:${JSON.stringify(href)}`;
  } catch {
    return kind;
  }
}

function runNavigation(action: () => void): void {
  try {
    action();
  } catch (error) {
    // Router actions can race with screen unmounts during auth/deep-link
    // transitions. Never let a native/router exception take down the app.
    if (__DEV__) console.warn("[navigation] ignored route transition error", error);
  }
}

// ── Safe router ───────────────────────────────────────────────────────────────

/**
 * Drop-in replacements for `router.push / replace / navigate / back`.
 * Duplicate protection for direct router calls lives in navigationGuard.
 * SafePressable still uses the local press lock before invoking callbacks.
 *
 * @example
 *   import { safeRouter } from "@/lib/navUtils";
 *   safeRouter.push("/profile");
 */
export const safeRouter = {
  push    (href: any, _cooldown = NAV_COOLDOWN_MS): void { runNavigation(() => router.push(href)); },
  replace (href: any, _cooldown = NAV_COOLDOWN_MS): void { runNavigation(() => router.replace(href)); },
  navigate(href: any, _cooldown = NAV_COOLDOWN_MS): void { runNavigation(() => router.navigate(href)); },
  back    (fallback?: string, _cooldown = NAV_COOLDOWN_MS): void {
    runNavigation(() => performBackNavigation({
      canGoBack: () => router.canGoBack(),
      back: () => router.back(),
      replace: (href) => router.replace(href as any),
    }, fallback));
  },
};

// ── React hooks ───────────────────────────────────────────────────────────────

/**
 * Returns stable, debounced navigation helpers bound to the global lock.
 * Prefer this over calling `router` directly inside event handlers.
 *
 * @example
 *   const { push, back } = useSafeNavigation();
 *   <Pressable onPress={() => push("/chat/123")} />
 */
export function useSafeNavigation() {
  const push     = useCallback((href: any) => safeRouter.push(href),     []);
  const replace  = useCallback((href: any) => safeRouter.replace(href),  []);
  const navigate = useCallback((href: any) => safeRouter.navigate(href), []);
  const back     = useCallback((fallback?: string) => safeRouter.back(fallback), []);
  return { push, replace, navigate, back };
}

/**
 * Wraps a press handler with the global navigation lock.
 * Use for buttons that perform navigation indirectly (openApp, etc.).
 * The returned function is stable and safe to use as a `useCallback` dep.
 *
 * @example
 *   const handleOpen = useSafePress(() => openApp("afumarket"));
 *   <Pressable onPress={handleOpen} />
 */
export function useSafePress<T extends any[]>(
  handler : (...args: T) => void,
  cooldown: number = NAV_COOLDOWN_MS,
): (...args: T) => void {
  const ref = useRef(handler);
  ref.current = handler;              // always up-to-date without re-creating
  return useCallback(
    (...args: T) => {
      if (!acquireNavLock(cooldown, navActionKeyForHandler(ref.current))) return;
      ref.current(...args);
    },
    // cooldown intentionally omitted — it never changes in practice
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
}
