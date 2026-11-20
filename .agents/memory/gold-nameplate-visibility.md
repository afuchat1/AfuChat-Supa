---
name: Gold Nameplate visibility
description: Global display rule for the equipped Gold Nameplate status effect.
---

Apply the Gold Nameplate to the owner's displayed profile name everywhere it appears, including public profile cover headers, with a visibly metallic reflective and shimmering finish rather than a flat yellow tint. Use a brighter theme-aware palette in dark mode so the name never reads as black. Keep the effect conditional on `sg4` being equipped or Platinum access.

**Why:** The user requires the gold name to remain visible across all locations and specifically asked for readable gold in dark mode and on public profiles.

**How to apply:** Use the shared `UserName` renderer whenever showing a user's display name and pass the stable user ID. Keep its palette legible on both theme backgrounds. Do not alter the entitlement rule or turn every account's name gold.
