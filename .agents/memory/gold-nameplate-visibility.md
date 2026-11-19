---
name: Gold Nameplate visibility
description: Global display rule for the equipped Gold Nameplate status effect.
---

Apply the Gold Nameplate to the owner's displayed profile name anywhere it is rendered, with a visibly metallic reflective and shimmering finish rather than a flat yellow tint. Keep the effect conditional on `sg4` being equipped or Platinum access.

**Why:** The user requires the gold name to remain visible across all locations and specifically asked for a real shining gold treatment.

**How to apply:** Use the shared `UserName` renderer whenever showing a user's display name and pass the stable user ID. Do not alter the entitlement rule or turn every account's name gold.
