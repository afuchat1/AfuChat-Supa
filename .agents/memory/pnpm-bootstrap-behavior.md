---
name: pnpm bootstrap behavior
description: A workspace toolchain mismatch that can exhaust processes during preview startup.
---

When the workspace-pinned pnpm version differs from the installed global pnpm, `pnpm run` may repeatedly spawn `pnpm add pnpm@<pinned-version>` processes and exhaust resources. In this environment the app preview can avoid that loop by invoking already-installed project binaries directly.

**Why:** The recursive bootstrap prevented both the web preview and Expo Go from starting until their workflows bypassed pnpm.

**How to apply:** If pnpm bootstrap errors recur, inspect running processes before retrying; prefer the installed Expo/Node binaries in preview workflows instead of changing dependency versions blindly.
