---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Keep the original AfuChat palette; the primary brand blue is `#1018D8`. Floating action buttons use the current app accent as a filled background with white icons, never an accent-colored icon on a glass surface. The AI editor is an inline composer control, not a FAB; it stays icon-only with no background.

Use Settings as the visual reference across pages: Light mode uses a `#E8E1D5` canvas and `#F0EBE1` cards; Dark mode uses a `#202226` canvas and `#18191C` cards. Standard grouped cards use 18px corners. Keep the chat conversation on one continuous base background. Align shared button fills and selected states with the app accent while preserving danger/status colors and behavior. Do not add decorative borders; leave input bars and navigation unchanged unless requested. Keep System, Light, and Dark theme choices, and avoid pure-black page backgrounds.

**Why:** The user designated Settings as the app-wide visual reference for page backgrounds, cards, and buttons, with rounded cards and a single chat-conversation background.

**How to apply:** Use the shared theme tokens rather than page-specific surface colors, keep semantic button states and existing interactions, use spacing instead of outlines, preserve the current app accent and white-on-accent FAB icons, and respect the user's selected theme.
