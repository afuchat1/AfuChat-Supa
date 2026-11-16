---
name: AfuChat brand colors
description: Preserve AfuChat's original brand palette when updating the app's visual design.
---

Use `#258FE5` as AfuChat's exact default primary blue. Non-premium accounts always use this color. Only Premium users may choose another app color from the existing accent list or change the manual appearance mode.

Use Settings as the visual reference across pages: Light mode uses a `#E8E1D5` canvas and `#F0EBE1` cards; Dark mode uses a `#202226` canvas and `#18191C` cards. Standard grouped cards use 18px corners. Keep the chat conversation on one continuous base background. Align shared button fills and selected states with the app accent while preserving danger/status colors and behavior. Do not add decorative borders; leave input bars and navigation unchanged unless requested. Keep System, Light, and Dark theme choices, and avoid pure-black page backgrounds.

**Why:** The user set `#258FE5` as the default brand color and restricted app color and manual appearance customization to Premium.

**How to apply:** Use shared theme tokens, keep free accounts on `#258FE5`, gate accent and manual theme-mode changes behind Premium, preserve semantic status colors, and use white icons on app-accent FABs.
