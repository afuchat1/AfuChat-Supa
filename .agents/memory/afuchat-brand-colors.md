---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Keep the original AfuChat palette; the primary brand blue is `#1018D8`. Floating action buttons use the current app accent as a filled background with white icons, never an accent-colored icon on a glass surface.

Use stronger contrast across the platform: a warm light canvas with near-white surfaces and more distinct secondary surfaces, and a charcoal dark canvas with lifted surfaces and brighter text/borders. Theme choices must remain available as System, Light, and Dark. Avoid pure-black screen and panel backgrounds; retain dark overlays only when needed for media contrast.

**Why:** The user asked to preserve the brand palette and both themes, then requested stronger app-wide readability and visible white-on-accent FABs.

**How to apply:** Use the semantic values from `useTheme()` for page, surface, input, text, border, and navigation colors. Keep text and control colors distinguishable in both themes, use the current app accent behind white FAB icons, do not introduce a new primary brand color, and do not force one theme while the user has selected another.
