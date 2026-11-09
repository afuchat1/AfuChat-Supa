---
name: EAS prebuild asset and lockfile checks
description: Cloud EAS failure modes for Expo notification assets and pnpm workspace lockfiles
---

EAS Android builds run a real Expo prebuild and a frozen pnpm install. Every asset path referenced by a config plugin must exist in the uploaded workspace, and the workspace lockfile importer specifiers must exactly match package manifests.

**Why:** A preview build failed in prebuild because the configured notification icon path did not exist. After that was fixed, the next build failed before prebuild because the Expo version in `package.json` differed from the importer specifier in `pnpm-lock.yaml`.

**How to apply:** Before submitting an EAS build, run `pnpm expo prebuild --no-install --platform android` locally, verify every plugin asset path, then run `CI=true pnpm install --frozen-lockfile` from the workspace root. Remove generated native directories afterward when the project is managed/prebuild-based.