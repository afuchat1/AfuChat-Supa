---
name: Expo Router navigation hooks
description: SDK 57 navigation hooks must come from Expo Router's own exports.
---

In Expo Router 57 screens, import navigation hooks such as `useIsFocused` from `expo-router`, not directly from `@react-navigation/native`. Expo Router's bundled React Navigation fork owns the navigation context; a direct package hook can fail to find it at runtime.

**Why:** A web chat route crashed with “Couldn't find a navigation object” after the direct React Navigation import was made resolvable.

**How to apply:** Before adding `@react-navigation/native` for an Expo Router screen, check whether Expo Router exports the hook and use its export to keep the hook and provider on the same context.
