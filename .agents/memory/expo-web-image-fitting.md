---
name: Expo web image fitting
description: Reliable fitting for wide, text-bearing hero images in Expo web previews.
---

For wide hero images containing text, React Native `ImageBackground` did not reliably honor the intended responsive frame and resize mode in the Expo web preview; it cropped or misplaced content. `expo-image` with explicit width and height plus `contentFit` rendered the full asset reliably.

**Why:** Cropping a content-bearing hero removes its title or subtitle, not just decorative pixels.

**How to apply:** Prefer `expo-image` for text-bearing hero artwork on Expo web, and verify the result at the target viewport. Use `ImageBackground` for decorative backgrounds that can tolerate cropping.
