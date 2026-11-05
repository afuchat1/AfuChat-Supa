---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Keep the original AfuChat palette; the primary brand blue is `#1018D8`. Floating action buttons use the current app accent as a filled background with white icons, never an accent-colored icon on a glass surface. The AI editor is an inline composer control, not a FAB; it stays icon-only with no background.

Use one theme-matched background for card surfaces across app pages: cream in Light mode and the main dark surface in Dark mode. Do not add borders or change buttons, bottom navigation, or input bars/fields when unifying card colors. Keep decorative borders and separators out of the interface; distinguish surfaces with spacing. Theme choices must remain available as System, Light, and Dark. Avoid pure-black screen and panel backgrounds; retain dark overlays only when needed for media contrast.

**Why:** The user asked to preserve the brand palette and both themes, requested stronger app-wide readability and white-on-accent FABs, chose a borderless app-wide treatment, and specified one card surface color per theme without changing interactive controls.

**How to apply:** Keep page and card surfaces unified within each theme while leaving input, button, and navigation colors independent. Use fills and spacing rather than decorative outlines, keep controls distinguishable in both themes, use the current app accent behind white FAB icons, do not introduce a new primary brand color, and do not force one theme while the user has selected another.
