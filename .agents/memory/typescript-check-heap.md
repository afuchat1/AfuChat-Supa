---
name: TypeScript check heap
description: Node heap sizing for full-project TypeScript checks in the Expo app.
---

Run full mobile app typechecks with `NODE_OPTIONS=--max-old-space-size=4096` from `artifacts/mobile`. The default Node heap can run out before diagnostics.

**Why:** The full Expo TypeScript project exceeded its default 2 GB Node heap, while a 4 GB run completed and passed.

**How to apply:** Use the 4 GB setting for `tsc -p tsconfig.json --noEmit`; do not interpret a heap-exhaustion crash as a source-code diagnostic.
