/**
 * notifBannerStore — lightweight event bus for the in-app notification banner.
 *
 * Usage:
 *   showBanner({ title, body, data, avatarUrl, type })  → triggers the banner
 *   subscribeBanner(cb)                                  → returns unsubscribe fn
 *   dismissBanner()                                      → hides the active banner
 */

export type BannerPayload = {
  id: string;
  title: string;
  body: string;
  type?: string;
  avatarUrl?: string | null;
  chatId?: string;
  postId?: string;
  actorId?: string;
  url?: string;
};

type BannerListener = (payload: BannerPayload | null) => void;

let _current: BannerPayload | null = null;
let _dismissTimer: ReturnType<typeof setTimeout> | null = null;
const _listeners = new Set<BannerListener>();

function notify() {
  _listeners.forEach((fn) => fn(_current));
}

export function showBanner(payload: Omit<BannerPayload, "id">, autoDismissMs = 0): void {
  if (_dismissTimer) { clearTimeout(_dismissTimer); _dismissTimer = null; }
  _current = { id: Math.random().toString(36).slice(2), ...payload };
  notify();
  // Auto-dismiss is now managed entirely inside InAppNotifBanner component.
  // Pass autoDismissMs > 0 only for legacy callers that need store-level timing.
  if (autoDismissMs > 0) {
    _dismissTimer = setTimeout(() => {
      _current = null;
      notify();
      _dismissTimer = null;
    }, autoDismissMs);
  }
}

export function dismissBanner(): void {
  if (_dismissTimer) { clearTimeout(_dismissTimer); _dismissTimer = null; }
  _current = null;
  notify();
}

export function getCurrentBanner(): BannerPayload | null {
  return _current;
}

export function subscribeBanner(fn: BannerListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
