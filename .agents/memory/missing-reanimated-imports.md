---
name: Reanimated lazy-load IIFE pattern (Android Expo Go)
description: Static `import from "react-native-reanimated"` crashes the entire module on Android Expo Go when the native worklet runtime fails to init. Must use IIFE lazy-load with safe stubs.
---

## The rule

Never use `import ... from "react-native-reanimated"` at the top level of any module that exports things other modules depend on at startup (hooks, providers, shared context). Instead, use a module-level IIFE lazy-load that returns `null` on failure, then alias each API to a stub.

**Why:** On Android Expo Go with react-native-reanimated ~3.19.5 + RN 0.81, the native worklet runtime throws `java.lang.NullPointerException` in `NativeProxy.initHybrid` during module evaluation. A static `import` propagates this Java exception to the JS module itself, making ALL exports of that module become `undefined` — including hooks that don't touch reanimated (like `useImageViewer`). A lazy `require()` inside a function runs later (post-bridge-init) or can be caught with try/catch.

**How to apply:**

Place this block after all `import` statements, before any function or component definitions:

```typescript
const _ra = (() => {
  try {
    const m = require("react-native-reanimated");
    if (m && typeof m.useSharedValue === "function") return m;
  } catch {}
  return null;
})();

function _stubSharedValue<T>(init: T): { value: T } {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ref = React.useRef({ value: init });
  return ref.current;
}

const useSharedValue   = (_ra?.useSharedValue   ?? _stubSharedValue)          as typeof import("react-native-reanimated").useSharedValue;
const useAnimatedStyle = (_ra?.useAnimatedStyle ?? ((_fn: any) => ({})))      as typeof import("react-native-reanimated").useAnimatedStyle;
const withSpring       = (_ra?.withSpring       ?? ((v: any) => v))            as typeof import("react-native-reanimated").withSpring;
const withTiming       = (_ra?.withTiming       ?? ((v: any) => v))            as typeof import("react-native-reanimated").withTiming;
const runOnJS          = (_ra?.runOnJS          ?? ((fn: any) => fn))          as typeof import("react-native-reanimated").runOnJS;
// For Reanimated.View, fall back to RN's Animated.View:
const ReAnimated       = { View: (_ra?.default?.View ?? Animated.View) as any };
```

- **`_stubSharedValue` MUST call `React.useRef`** so it is a valid React hook. Since `_ra` is determined once at module-init and never changes, components always call the SAME function — satisfying Rules of Hooks.
- `useAnimatedStyle` stub returns `{}` — the component renders without animation but doesn't crash.
- `withSpring` / `withTiming` stubs return the target value directly — assignments are instant but silent.
- `runOnJS` stub returns the function itself — `runOnJS(fn)()` still calls `fn`.

**Files fixed with this pattern:**
- `artifacts/mobile/components/ImageViewer.tsx` — uses split AnimatedViewer/SimpleViewer components to avoid conditional hooks entirely
- `artifacts/mobile/app/chat/[id].tsx` — IIFE + stubs at module level
- `artifacts/mobile/components/VideoFeed.tsx` — IIFE + stubs at module level
- `artifacts/mobile/context/TabSwipeContext.tsx` — `makeMutable` lazy-required inside `createScrollLock()` (already has try-catch)

**Do NOT** mix `import` statements after the IIFE const block — Metro/TypeScript requires all `import` declarations before any executable code. Put all imports first, then the IIFE block.
