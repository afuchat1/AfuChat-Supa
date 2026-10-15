---
name: pnpm install missing on Replit
description: node_modules for artifacts/mobile are not pre-installed; must run CI=true pnpm install from workspace root before the app can start.
---

## Rule
After any environment reset or fresh session where the app fails to start with a PluginError, Metro resolver error, or missing module error, run:

```
CI=true pnpm install
```

from `/home/runner/workspace` (the workspace root, not artifacts/mobile).

**Why:** Replit does not persist node_modules between sessions. The pnpm workspace (pnpm-workspace.yaml) covers `artifacts/mobile`. Without `CI=true`, pnpm aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` because there is no interactive terminal.

**How to apply:** Whenever the Start application workflow fails with `PluginError: Failed to resolve plugin`, `Cannot find module`, or an unexpected missing package shim, run the install command above first. Takes ~35s with the lockfile cached.

If a frozen reinstall reports that the Expo version in the mobile manifest differs from the lockfile, use `CI=true pnpm install --no-frozen-lockfile` from the workspace root to reconcile it before restarting the workflow.

If reinstalling fails with `ERR_PNPM_FETCH_403` for a locked transitive package, do not assume dependencies were restored or keep repeating the same install. Follow package-management's firewall recovery guidance for the blocked dependency before retrying the app workflow.

**Why:** A dependency restore was blocked by the Replit package firewall while fetching a transitive package, leaving Expo unable to resolve a required plugin.

**How to apply:** Confirm the install completed successfully before restarting Expo; if it reports a firewall 403, identify the parent dependency and resolve that issue without changing registries or bypassing the firewall.
