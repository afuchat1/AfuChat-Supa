---
name: pnpm bootstrap behavior
description: A workspace toolchain mismatch that can exhaust processes during preview startup.
---

When the workspace-pinned pnpm version differs from the installed global pnpm, invoking the global binary may repeatedly spawn `pnpm add pnpm@<pinned-version>` processes and exhaust resources. Avoid the global binary for installs and version checks.

For workspace dependency changes, use Corepack's project-pinned pnpm shim in a temporary directory and prepend that directory to `PATH`; verify the reported version matches the root `packageManager` first. A direct symlink to the Corepack executable is not a working pnpm shim. Preview workflows can avoid bootstrap loops by invoking already-installed project binaries directly.

**Why:** A global/pinned mismatch caused recursive bootstrap. A failed Expo install also left package metadata updated while installed modules still resolved stale Expo CLI 55; a frozen install with pinned pnpm restored the SDK 57 workspace.

**How to apply:** Before retrying a pnpm failure, inspect for leftover processes. Use installed Expo/Node binaries in preview workflows and Corepack's generated shim for package changes; after a failed Expo install, run the pinned frozen install before restarting Expo.
