---
name: LTR interface direction
description: The app supports Arabic copy without switching the overall interface into RTL layout.
---

AfuChat's interface is intentionally left-to-right for every selected language, including Arabic. Language selection changes translated copy only; it must not mirror navigation, control placement, spacing, or alignment.

**Why:** Arabic selection previously drove a root RTL shell and several per-screen layout branches, making the app feel inconsistent. React Native Web also reports an error when `direction` is passed as an inline React Native View style.

**How to apply:** Keep native direction disabled with `I18nManager.allowRTL(false)` and `I18nManager.forceRTL(false)`, keep Android `supportsRtl` disabled, and apply web direction through global CSS rather than a React Native `direction` style. Preserve the `isRTL` context field only for compatibility, with a fixed `false` value.