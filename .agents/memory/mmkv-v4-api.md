---
name: MMKV v4 Nitro API change
description: Breaking API change in react-native-mmkv v4 — constructor changed from new MMKV to createMMKV.
---

## The rule
`react-native-mmkv` v4.x replaced the class constructor with a factory function.

Old (v3): `const { MMKV } = require("react-native-mmkv"); const store = new MMKV({ id: "my-store" });`
New (v4): `const { createMMKV } = require("react-native-mmkv"); const store = createMMKV({ id: "my-store" });`

**Why:** v4 switched to Nitro modules (HybridObject) which uses factory functions, not JS class constructors.

**How to apply:** When upgrading from v3 to v4, grep for `new MMKV(` and replace with `createMMKV(`. The instance API (`.getString()`, `.set()`, `.getBoolean()`, `.getNumber()`, `.delete()`, `.contains()`, `.getAllKeys()`, `.clearAll()`) is unchanged.

The wrapper lives in `artifacts/mobile/lib/storage/mmkv.ts` — all app code goes through the `storage` facade, so only the one construction site in `getStore()` needed updating.
