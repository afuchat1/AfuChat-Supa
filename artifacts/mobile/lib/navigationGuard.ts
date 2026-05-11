/**
 * navigationGuard.ts
 *
 * Patches the expo-router `router` singleton so every call to
 * router.push / router.replace / router.back across the entire app
 * is automatically debounced — a second call within LOCK_MS of the
 * first is silently dropped.
 *
 * Import this module once as a side-effect at the top of the root
 * _layout.tsx and you're done. No changes needed at any call site.
 */
import { router } from "expo-router";

const LOCK_MS = 600;

let _locked = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

function acquire(): boolean {
  if (_locked) return false;
  _locked = true;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(release, LOCK_MS);
  return true;
}

/** Call this to manually release early (e.g. after a back press). */
export function release(): void {
  _locked = false;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

const _origPush    = router.push.bind(router);
const _origReplace = router.replace.bind(router);
const _origBack    = router.back.bind(router);

(router as any).push = (...args: Parameters<typeof router.push>) => {
  if (!acquire()) return;
  _origPush(...args);
};

(router as any).replace = (...args: Parameters<typeof router.replace>) => {
  if (!acquire()) return;
  _origReplace(...args);
};

(router as any).back = () => {
  if (!acquire()) return;
  _origBack();
};
