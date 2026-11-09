---
name: Expo dependency recovery
description: Workspace-specific recovery when pnpm module metadata and dependency installation get out of sync.
---

When pnpm reports a public-hoist-pattern mismatch while installing an Expo dependency, recreate the workspace modules from the lockfile before retrying the package installation. Restart Metro after the rebuild because it can retain watcher paths to temporary pnpm directories.

**Why:** A stale or partially recreated pnpm modules directory can make Metro fail on missing transient paths even after the requested packages are present.

**How to apply:** Use the lockfile-preserving workspace install/rebuild, then restart the managed Expo workflow and verify a fresh bundle before declaring the app healthy.