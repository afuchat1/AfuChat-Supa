---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Keep the original AfuChat palette; the primary brand blue is `#1018D8`. Floating action buttons use the current app accent as a filled background with white icons, never an accent-colored icon on a glass surface. The AI editor is an inline composer control, not a FAB; it stays icon-only with no background.

Use stronger contrast across the platform: a warm light canvas with near-white surfaces and more distinct secondary surfaces, and a charcoal dark canvas with lifted surfaces and brighter text. Keep decorative borders and separators out of the interface; distinguish surfaces with fills and spacing. Theme choices must remain available as System, Light, and Dark. Avoid pure-black screen and panel backgrounds; retain dark overlays only when needed for media contrast.

**Why:** The user asked to preserve the brand palette and both themes, requested stronger app-wide readability and white-on-accent FABs, and later chose a borderless app-wide treatment.

**How to apply:** Use the semantic values from `useTheme()` for page, surface, input, text, and navigation colors. Use fills and spacing rather than decorative outlines, keep controls distinguishable in both themes, use the current app accent behind white FAB icons, do not introduce a new primary brand color, and do not force one theme while the user has selected another.
