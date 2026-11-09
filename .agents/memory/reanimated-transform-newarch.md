---
name: Reanimated transform crash on Android new arch
description: Expo Go + RN 0.81 new arch crashes with String-to-ReadableArray ClassCastException when Reanimated.View uses useAnimatedStyle returning transform arrays.
---

## The rule
Do NOT use `Reanimated.View` + `useAnimatedStyle(() => ({ transform: [...] }))` in screens that new users hit before completing onboarding. In Expo Go with `newArchEnabled: true`, the Fabric renderer crashes during `dispatchMountItems` with `java.lang.String cannot be cast to com.facebook.react.bridge.ReadableArray`.

**Why:** React Native 0.81 + Expo SDK 54 new arch (Fabric) in Expo Go incorrectly serializes Reanimated animated `transform` arrays as JSON strings when passing to the native `setProperty` call. The same pattern also applies to static `StyleSheet.create` styles with `transform: [{ scale: 1.15 }]` applied conditionally.

**How to apply:**
- For page-level swipe animations: use native `ScrollView` with `horizontal + pagingEnabled` + `scrollTo` imperative control. No transform arrays needed.
- For dot indicators: use plain `View` with step-based inline styles (width/borderRadius/opacity) instead of `useAnimatedStyle`.
- For static accent/scale effects: use `borderWidth + borderColor` instead of `transform: [{ scale }]` in StyleSheet.
- Screens in (tabs) use React Native's `Animated.View` (old arch animation API) for transforms — this works fine. The crash is specific to `Reanimated.View`.
- The onboarding fix: replaced `GestureDetector + Reanimated.View pager` with `ScrollView pagingEnabled + onMomentumScrollEnd` for swipe validation.
- `MiniAppWindow.tsx` fix: replaced `useSharedValue/useAnimatedStyle/withSpring/withTiming/runOnJS` with `useRef(new Animated.Value)` + `Animated.spring/timing/parallel`. `.start()` callback replaces `runOnJS(setShowing)`. Behaviour is identical.
