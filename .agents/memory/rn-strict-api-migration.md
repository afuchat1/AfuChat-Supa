---
name: React Native strict API migration
description: Temporary SDK 58 type compatibility decision and future migration.
---

React Native 0.88 provides a documented opt-out to its previous manual TypeScript definitions. The app temporarily uses that compatibility path while retaining strict TypeScript checking; this avoids a broad ref migration as part of the Expo SDK dependency upgrade.

**Why:** The SDK 58 type check exposed strict-API differences across many screens. React Native says this compatibility option will be removed in a future release.

**How to apply:** Keep the compatibility setting until refs and related call sites are migrated to the strict API, then remove the opt-out and verify typechecking.
