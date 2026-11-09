---
name: Async handler safety — try/finally for loading state + stuck spinner prevention
description: Rules for async onPress callbacks and data-fetch functions to prevent stuck spinners and silent failures.
---

## Rules

### 1. Every async `onPress` with a loading flag MUST use `try/finally`
```tsx
// BAD — any throw leaves isLoading stuck at true forever
setLoading(true);
const result = await doSomething();
setLoading(false);

// GOOD
setLoading(true);
try {
  const result = await doSomething();
  // handle success
} catch (_) {
  showAlert("Error", "Something went wrong.");
} finally {
  setLoading(false);
}
```

### 2. Every `onRefresh` with `setRefreshing` MUST use `finally`
```tsx
const onRefresh = async () => {
  setRefreshing(true);
  try { await load(); } finally { setRefreshing(false); }
};
```

### 3. Custom alerts: use `showAlert` not `Alert.alert`
All user-facing alerts go through `showAlert` from `@/lib/alert`. The `Alert.alert` fallback in `lib/alert.ts` itself is intentional — don't replace it.

## Why
- Missing `finally` on loading state leaves spinners stuck after any network/runtime error.
- Missing `try/catch` in async `onPress` handlers causes unhandled promise rejections that can crash the JS runtime.
- `Alert.alert` on native is fine but bypasses the custom `AlertModal`, which has theming, backdrop dismiss, and `confirmAlert` promise support.

## Files audited (this pass)
All `app/shop/*`, `app/settings/*`, `app/wallet/*`, `app/chat/new.tsx`, `app/(tabs)/*.tsx`, `app/channel/*`, `app/company/*`, `app/gifts/*`, `app/my-posts/*`, `app/prestige.tsx`, `app/user-discovery.tsx`, `app/contact/*`, `app/post/*`, `app/video/*`, `app/chat/[id].tsx` (report + clipboard handlers), `components/ui/AlertModal.tsx`.
