---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Keep the original AfuChat palette; the primary brand blue is `#1018D8`.

For app surfaces, use AfuSearch's shared palette across the platform: light `#F5F0E8` and dark `#202124`. Theme choices must remain available as System, Light, and Dark. Avoid pure-black screen and panel backgrounds; retain dark overlays only when needed for media contrast.

**Why:** The user asked to preserve the brand palette and use AfuSearch's surface colors throughout AfuChat with both light and dark themes.

**How to apply:** Use the semantic values from `useTheme()` for page, surface, input, text, border, and navigation colors. Do not introduce a new primary brand color or force one theme while the user has selected another.
