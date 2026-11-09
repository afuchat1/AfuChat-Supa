---
name: pnpm bootstrap behavior
description: A workspace toolchain mismatch that can exhaust processes during preview startup.
---

When the workspace-pinned pnpm version differs from the installed global pnpm, invoking the global binary may repeatedly spawn `pnpm add pnpm@<pinned-version>` processes and exhaust resources. Avoid the global binary for installs and version checks. After a branch reset or manifest change, installed `node_modules` may also belong to a different Expo SDK; align them from the lockfile before diagnosing unresolved imports.

For workspace dependency changes, use Corepack's generated project-pinned pnpm shim in a temporary directory and prepend that directory to `PATH`; verify the reported version matches the root `packageManager` first. A direct symlink to the Corepack executable is not a working pnpm shim. After a reset or dependency mismatch, use a frozen workspace install. Preview workflows can avoid bootstrap loops by invoking already-installed project binaries directly.

**Why:** A global/pinned mismatch caused recursive bootstrap, and stale installed Expo packages made a valid SDK subpath appear missing. A frozen install with pinned pnpm restored the lockfile's SDK packages without changing the lockfile.

**How to apply:** Before retrying a pnpm failure, inspect for leftover processes. Use installed Expo/Node binaries in preview workflows and Corepack's generated shim for package changes; after a reset or failed Expo install, run the pinned frozen install and verify `expo install --check` before restarting Expo. If the shim is unavailable and global pnpm aborts during self-install, `npm_config_manage_package_manager_versions=false` allowed a frozen install and typecheck here; verify the lockfile remains unchanged.

If a frozen install after a reset fails with `ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY` for an Expo snapshot, the restored lockfile itself may be incomplete even when pnpm says it is current. Resolve once with `--no-frozen-lockfile`, inspect the lockfile diff, then confirm with a frozen install.

**Why:** A reset from origin exposed a structurally incomplete lockfile; this was separate from stale `node_modules` and did not require changing Expo versions.

**How to apply:** Repair the missing lock snapshot with the pinned pnpm, then verify reproducibility before diagnosing application code or upgrading packages.
