/**
 * AnimationGuard — proactive OOM prevention for React Native animations.
 *
 * ── Problem ──────────────────────────────────────────────────────────────────
 * NativeAnimatedNodesManager.updateNodes() runs on every vsync and holds a
 * reference to every active Animated.Value node. If the app is backgrounded
 * while many animations are in-flight (voice waveforms, feed hearts, sheet
 * transitions, looping progress rings, etc.) those nodes accumulate over time
 * and eventually exhaust the Java heap (268 MB limit on most Android devices)
 * causing an OutOfMemoryError FATAL EXCEPTION on the next vsync tick.
 *
 * ── Solution ─────────────────────────────────────────────────────────────────
 * 1. Explicit registry — animated values are held only while their owning
 *    component is mounted. The hooks unregister them on unmount.
 *
 * 2. AppState listener — when the app transitions to `inactive` or `background`
 *    (home-button press, incoming call, screen-off) every registered animation
 *    is immediately cancelled, releasing all vsync callbacks.
 *
 * 3. iOS MemoryWarning — if the OS sends a low-memory signal, we cancel
 *    immediately without waiting for a background transition.
 *
 * 4. Three value types supported:
 *    • Reanimated SharedValue  (react-native-reanimated v4+)
 *    • Legacy Animated.Value   (React Native core Animated API)
 *    • CompositeAnimation      (Animated.loop / Animated.sequence refs)
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 * Call initAnimationGuard() once at app startup (done in AnimationGuardInit).
 * Components register values via the useAnimationGuard() / useAnimationGuardComposite()
 * hooks in hooks/useAnimationGuard.ts.
 */

import {
  AppState,
  Platform,
  type AppStateStatus,
  type NativeEventSubscription,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LegacyAnimatedValue = {
  stopAnimation: (cb?: (value: number) => void) => void;
};

export type CompositeAnimation = {
  start: (cb?: (result: { finished: boolean }) => void) => void;
  stop: () => void;
  reset: () => void;
};

export type GuardedValue =
  | LegacyAnimatedValue
  | SharedValue<any>
  | CompositeAnimation;

// ── Config ────────────────────────────────────────────────────────────────────

const DEV = typeof __DEV__ !== "undefined" ? __DEV__ : false;
const TAG = "[AnimationGuard]";

// ── Module state ──────────────────────────────────────────────────────────────

/** Mounted animation values; hook cleanups remove entries deterministically. */
const registry = new Set<GuardedValue>();

let appStateListener: NativeEventSubscription | null = null;
let memWarningListener: NativeEventSubscription | null = null;

/** Lazily loaded cancelAnimation from Reanimated — avoids import at module eval time. */
let _cancelAnimFn: ((v: SharedValue<unknown>) => void) | null = null;

let initialized = false;
let previousState: string = AppState.currentState ?? "active";

// ── Diagnostics (dev / crash-reporter) ───────────────────────────────────────

let _totalCancelled = 0;
let _lastBgAt = 0;
let _sweepCount = 0;

// ── Type guards ───────────────────────────────────────────────────────────────

function isSharedValue(v: unknown): v is SharedValue<unknown> {
  if (!v || typeof v !== "object") return false;
  const sv = v as Record<string, unknown>;
  // Reanimated v4 internal marker
  if (sv._isReanimatedSharedValue === true) return true;
  // Duck-type: SharedValue always has `.value` plus either `.addListener` (v4)
  // or `.modify` (worklet mutation API). Composite animations also have `.value`
  // sometimes, so we require the listener/modify method to distinguish them.
  return (
    "value" in sv &&
    (typeof sv.addListener === "function" || typeof sv.modify === "function")
  );
}

function isCompositeAnimation(v: unknown): v is CompositeAnimation {
  if (!v || typeof v !== "object") return false;
  const ca = v as Record<string, unknown>;
  return (
    typeof ca.stop  === "function" &&
    typeof ca.start === "function" &&
    typeof ca.reset === "function"
  );
}

function isLegacyAnimatedValue(v: unknown): v is LegacyAnimatedValue {
  if (!v || typeof v !== "object") return false;
  return typeof (v as Record<string, unknown>).stopAnimation === "function";
}

// ── Lazy Reanimated loader ────────────────────────────────────────────────────

function getCancelAnimation(): ((v: SharedValue<unknown>) => void) | null {
  if (_cancelAnimFn) return _cancelAnimFn;
  try {
    const rnr = require("react-native-reanimated");
    if (typeof rnr.cancelAnimation === "function") {
      _cancelAnimFn = rnr.cancelAnimation;
    }
  } catch {
    // Reanimated unavailable (web shim, test env, etc.)
  }
  return _cancelAnimFn;
}

// ── Core cancel sweep ─────────────────────────────────────────────────────────

/**
 * Cancel every registered animation. Runs in O(n) where n = registry size.
 * All cancellations are wrapped in try/catch — a buggy value can never abort
 * the sweep and leave other animations running.
 */
function cancelAll(reason: string): void {
  const cancelAnim = getCancelAnimation();
  let cancelled = 0;

  for (const value of registry) {
    try {
      if (isSharedValue(value) && cancelAnim) {
        cancelAnim(value as SharedValue<unknown>);
        cancelled++;
      } else if (isCompositeAnimation(value)) {
        value.stop();
        cancelled++;
      } else if (isLegacyAnimatedValue(value)) {
        value.stopAnimation();
        cancelled++;
      }
    } catch {
      // Individual cancellation errors are swallowed — never block the sweep.
    }
  }

  _totalCancelled += cancelled;
  _sweepCount++;

  if (DEV) {
    console.log(
      `${TAG} sweep[${_sweepCount}] reason="${reason}" ` +
      `cancelled=${cancelled} ` +
      `remaining=${registry.size} totalCancelled=${_totalCancelled}`
    );
  }
}

// ── AppState handler ──────────────────────────────────────────────────────────

function handleAppStateChange(next: AppStateStatus): void {
  const wasActive  = previousState === "active";
  const goingBack  = next === "background" || next === "inactive";

  if (wasActive && goingBack) {
    _lastBgAt = Date.now();
    cancelAll(`appState:${next}`);
  }

  previousState = next;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the animation guard.
 * Idempotent — safe to call multiple times; only the first call takes effect.
 * Call this once at app startup (AnimationGuardInit component handles this).
 */
export function initAnimationGuard(): void {
  if (initialized) return;
  initialized = true;

  previousState = AppState.currentState ?? "active";
  appStateListener = AppState.addEventListener("change", handleAppStateChange);

  // iOS: subscribe to OS memory-pressure events.
  // These fire before an OOM kill, giving us a chance to shed animation load.
  if (Platform.OS === "ios") {
    try {
      memWarningListener = AppState.addEventListener(
        // RN exposes this on iOS only; the cast is necessary because TS
        // definitions don't include this event name in older @types/react-native.
        "memoryWarning" as any,
        () => cancelAll("memoryWarning")
      );
    } catch {
      // Older RN versions may not have this — not fatal
    }
  }

  if (DEV) {
    console.log(
      `${TAG} initialized — platform=${Platform.OS} ` +
      `appState=${AppState.currentState}`
    );
  }
}

/**
 * Register a single animated value with the guard.
 *
 * Holds a value until its owner calls the returned cleanup function. Hooks
 * register that cleanup with their unmount effect.
 *
 * @param value  An Animated.Value, Reanimated SharedValue, or CompositeAnimation
 * @returns      Cleanup function — call on component unmount
 */
export function registerAnimation(value: GuardedValue): () => void {
  if (!value) return _noop;

  // Deduplicate: if this exact object is already registered, return its cleanup.
  for (const existing of registry) {
    if (existing === value) {
      return () => registry.delete(existing);
    }
  }

  registry.add(value);

  return () => registry.delete(value);
}

/**
 * Register multiple animated values at once.
 * Returns a single cleanup function that unregisters all of them.
 */
export function registerAnimations(values: GuardedValue[]): () => void {
  const fns = values.map(registerAnimation);
  return () => fns.forEach((fn) => fn());
}

/**
 * Manually trigger a full cancel sweep.
 * Useful for responding to custom memory-pressure events or before heavy
 * navigation transitions.
 */
export function cancelAllAnimations(reason = "manual"): void {
  cancelAll(reason);
}

/**
 * Runtime diagnostics — useful for crash reporters and dev tooling.
 */
export function getAnimationGuardStats() {
  return {
    initialized,
    registered: registry.size,
    totalCancelled: _totalCancelled,
    sweepCount: _sweepCount,
    lastBackgroundAt: _lastBgAt,
    platform: Platform.OS,
  } as const;
}

function _noop(): void {}
