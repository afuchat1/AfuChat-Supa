import { isOnline, onConnectivityChange } from "./offlineStore";

export type ToastType = "error" | "success" | "info" | "warning";

export type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
};

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
let _listener: Listener | null = null;
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerToastListener(fn: Listener): () => void {
  _listener = fn;
  fn([..._toasts]);
  return () => {
    if (_listener === fn) _listener = null;
  };
}

function _notify() {
  _listener?.([..._toasts]);
}

export function showToast(
  message: string,
  options?: { type?: ToastType; duration?: number; id?: string },
): string {
  const id =
    options?.id ??
    `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const type = options?.type ?? "info";
  const duration =
    options?.duration !== undefined
      ? options.duration
      : type === "error"
        ? 4000
        : type === "success"
          ? 2500
          : 3000;

  _toasts = _toasts.filter((t) => t.id !== id);
  if (_toasts.length >= 3) _toasts = _toasts.slice(-2);
  _toasts.push({ id, message, type, duration });
  _notify();

  const prev = _timers.get(id);
  if (prev) clearTimeout(prev);
  if (duration > 0) {
    const timer = setTimeout(() => dismissToast(id), duration);
    _timers.set(id, timer);
  }

  return id;
}

export function dismissToast(id: string) {
  const timer = _timers.get(id);
  if (timer) {
    clearTimeout(timer);
    _timers.delete(id);
  }
  const prev = _toasts.length;
  _toasts = _toasts.filter((t) => t.id !== id);
  if (_toasts.length !== prev) _notify();
}

let _connectivityInitialized = false;

export function initConnectivityToasts() {
  if (_connectivityInitialized) return;
  _connectivityInitialized = true;

  if (!isOnline()) {
    showToast("No internet connection", {
      type: "error",
      duration: 0,
      id: "connectivity",
    });
  }

  onConnectivityChange((online) => {
    if (online) {
      dismissToast("connectivity");
      showToast("Back online", { type: "success", duration: 2500 });
    } else {
      showToast("No internet connection", {
        type: "error",
        duration: 0,
        id: "connectivity",
      });
    }
  });
}
