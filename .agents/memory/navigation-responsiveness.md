---
name: Navigation responsiveness
description: The app has two separate navigation duplicate-protection layers that must stay aligned
---

Navigation duplicate protection is implemented in both the direct Expo Router patch and the `navUtils` helpers used by `SafePressable`/`SafeTouchableOpacity`. The direct patch must be imported from the root layout. Different destinations should remain immediately selectable; only repeated identical actions need a short throttle. Direct back calls need a no-history fallback.

**Why:** Updating only the direct router patch leaves high-traffic SafePressable buttons subject to the older global cooldown, while failing to mount the patch leaves direct calls without duplicate protection or a fallback when the stack is empty.

**How to apply:** When changing navigation, inspect and update both layers, ensure the router patch is mounted at root startup, preserve duplicate-tap protection, and prefer action-keyed short windows over a global lock that blocks unrelated destinations. Use Chats as the authenticated no-history fallback.