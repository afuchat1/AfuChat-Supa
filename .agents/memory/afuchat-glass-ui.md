---
name: AfuChat glass UI
description: User-directed boundaries for glass styling across the AfuChat app.
---

AfuChat glass should match Android 16/iOS system control panels: strong backdrop blur, neutral translucent frost, a fine pale edge, a restrained top sheen, and rounded pill/tile shapes. Apply selectively to navigation, floating controls, dialogs/sheets, media overlays, and primary composer/reply/search bars. Preserve AfuChat colors, behavior, and light mode; keep content screens opaque.

In light mode, use pure white for the platform's primary background and glass-button fills. Keep text and icons legible and preserve blue AfuChat actions.

In dark mode, keep the app background dark, use white for shared inactive/muted icon tones, and make the glass composer/search/reply bars cream with dark contents for contrast.

**Why:** The user requested system-style frosted glass, white glass controls and light backgrounds, then clarified that dark-mode icons should be white while only the input bars become cream.

**How to apply:** Reuse glass tokens and BlurView on the named surfaces. Avoid turning ordinary content or every form field transparent; don't use gray fills for glass buttons.
