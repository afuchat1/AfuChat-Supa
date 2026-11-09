---
name: Gesture.Pan worklet crash when Reanimated is stubbed
description: Guarding the Reanimated require is not enough — Babel-compiled Gesture.Pan worklet callbacks still crash when shared values are plain React ref stubs.
---

## The rule
Guarding `require("react-native-reanimated")` at module-eval time is necessary but NOT sufficient.  
Any file that also uses `Gesture.Pan().onBegin(worklet)` (or any RNGH gesture with Reanimated worklet callbacks) MUST also gate the `<GestureDetector>` component itself on a runtime flag.

## Why
The Reanimated Babel plugin compiles `.onBegin(() => { sharedVal.value = withSpring(...) })` into a worklet descriptor at **build time**, regardless of whether Reanimated is actually loaded at runtime.  
When the gesture fires on Android Expo Go (`_ra === null`), Reanimated runs that worklet on the UI thread.  
The worklet tries to call native Reanimated methods (`.value` setter, `withSpring` animation scheduler) on the plain React ref stubs — instant crash that JS try/catch cannot stop.

## How to apply
1. After the Reanimated lazy-load guard, add:  
   `const _reanimatedEnabled = _ra !== null;`
2. Wherever a `<GestureDetector gesture={panGesture}>` wraps an animated mic/swipe/drag button, wrap it:
   ```jsx
   {_reanimatedEnabled ? (
     <GestureDetector gesture={panGesture}>
       <ReAnimated.View ...>...</ReAnimated.View>
     </GestureDetector>
   ) : (
     <Pressable onPressIn={onStart} onPressOut={onEnd} style={staticStyle}>
       ...
     </Pressable>
   )}
   ```
3. The Pressable fallback only needs `onPressIn` / `onPressOut` — no animations needed in dev.

## Applied in
`artifacts/mobile/app/chat/[id].tsx` — mic button (two render paths, both fixed).
