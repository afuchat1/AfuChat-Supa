---
name: TabSwipeContext makeMutable crash on APK release
description: Using makeMutable from Reanimated in TabSwipeContext crashed on Android APK release builds (not caught by the __DEV__ guard).
---

## Rule
Never use `makeMutable` (or any Reanimated worklet API) in a shared context value that mounts at tab layout initialization time.

**Why:** `TabSwipeContext.tsx` used `makeMutable(false)` from Reanimated to create the `horizontalScrollActive` shared value. The guard was:
```ts
if (Platform.OS === "android" && __DEV__) return { value: false };
```
In Expo Go (always `__DEV__ = true`), the guard fires and Reanimated is never called — safe.
In APK release builds (`__DEV__ = false`), the guard is bypassed → `makeMutable` is called at tab layout mount (after login) → crash.

**Crash chain:**
1. User logs in → navigates to `/(tabs)/chats`
2. `_tabLayout.tsx` renders `<TabSwipeProvider>` for the first time
3. `TabSwipeProvider` calls `createScrollLock()` → `require("react-native-reanimated")` → `makeMutable(false)`
4. On APK release, `__DEV__` is false so the guard doesn't fire → Reanimated crash

**How to apply:**
- `horizontalScrollActive` is ONLY mutated from JS scroll callbacks (not worklets), so it does not need to be a Reanimated SharedValue
- Use a plain mutable object `{ value: false }` with `useRef` — no Reanimated needed at all
- This is the fix applied in `artifacts/mobile/context/TabSwipeContext.tsx`

Also note: the `ClassicTabLayout` in `_tabLayout.tsx` uses `lazy: false` as the default `screenOptions`, meaning all tab screens mount simultaneously on first navigation to any tab route. Any crash in any tab screen's first render will appear as a crash "when logging in."
