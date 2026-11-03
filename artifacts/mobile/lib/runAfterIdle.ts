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

  const timer = setTimeout(callback, 0);
  return {
    cancel: () => clearTimeout(timer),
  };
}
