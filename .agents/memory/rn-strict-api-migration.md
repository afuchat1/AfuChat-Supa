---
name: React Native strict API migration
description: SDK 58 uses React Native's strict public API instance types.
---

Keep React Native 0.88's strict public API types enabled; do not restore the legacy deep-import condition. Use the exported instance types for core component refs, and use `ListViewToken` for list viewability callbacks. Pass `undefined` rather than `null` to optional list components, and guard optional state and list indexes.

**Why:** React Native's legacy TypeScript condition is temporary, and the mobile app now typechecks without it.

**How to apply:** Preserve strict instance types in mobile code and run `pnpm --filter @workspace/mobile run typecheck` after React Native API or ref changes.
