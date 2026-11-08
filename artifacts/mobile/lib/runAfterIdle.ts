type IdleCallbackScheduler = typeof globalThis & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Schedule non-urgent work once JavaScript is idle. React Native 0.88 removes
 * InteractionManager; the timeout fallback also covers web runtimes without
 * requestIdleCallback.
 */
export function runAfterIdle(callback: () => void): { cancel: () => void } {
  const scheduler = globalThis as IdleCallbackScheduler;

  if (typeof scheduler.requestIdleCallback === "function") {
    const handle = scheduler.requestIdleCallback(callback);
    return {
      cancel: () => scheduler.cancelIdleCallback?.(handle),
    };
  }

  // React Native runtimes without requestIdleCallback still need a small
  // grace period after the current frame. A zero-delay timer runs immediately
  // after the current JS task and can compete with first-screen rendering.
  const timer = setTimeout(callback, 250);
  return {
    cancel: () => clearTimeout(timer),
  };
}
