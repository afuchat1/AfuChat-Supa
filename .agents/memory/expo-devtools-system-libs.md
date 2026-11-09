---
name: Expo DevTools system libraries
description: React Native DevTools on Replit may require desktop runtime libraries before Expo Metro opens its configured web port.
---

## Rule
If Expo starts but stalls while installing React Native DevTools with missing shared-library errors, install the reported Nix runtime libraries before restarting the workflow.

**Why:** The Expo Go workflow can remain marked running without opening port 5000 when the React Native DevTools binary cannot load its native GTK/desktop dependencies.

**How to apply:** Check workflow logs for the exact missing `.so`, install the corresponding supported system package, restart `Start application`, and verify both port 5000 and the Expo Go QR/deep link.