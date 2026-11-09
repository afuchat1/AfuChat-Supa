---
name: Bold logo asset delivery
description: Runtime and native delivery constraints for the heavier white AfuChat logo.
---

The heavier white AfuChat mark is kept as a transparent PNG for native splash/app asset bundling, but shared runtime rendering uses a data URI generated from that exact PNG because the local bundled PNG `require()` path did not render reliably through the React Native Web preview.

**Why:** The local asset reserved layout space but appeared invisible in the web preview, while the existing data-URI delivery rendered consistently across the app.

**How to apply:** When updating the white logo artwork, regenerate the transparent PNG, regenerate its data-URI module, and keep the native splash configuration pointed at the PNG.