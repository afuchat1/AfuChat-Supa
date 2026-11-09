type ScheduledTask = {
  cancel: () => void;
};

export function scheduleAfterInteractions(callback: () => void): ScheduledTask {
  const idleRequest = (globalThis as any).requestIdleCallback as
    | ((callback: () => void, options?: { timeout?: number }) => number)
    | undefined;
  const idleCancel = (globalThis as any).cancelIdleCallback as
    | ((handle: number) => void)
    | undefined;

  if (idleRequest) {
    const handle = idleRequest(callback, { timeout: 1000 });
    return { cancel: () => idleCancel?.(handle) };
  }

  const handle = setTimeout(callback, 0);
  return { cancel: () => clearTimeout(handle) };
}
