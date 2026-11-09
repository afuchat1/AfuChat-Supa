---
name: Vercel Babel workspace dependencies
description: Expo web exports on Vercel may need Babel runtime packages declared at the workspace root for react-native-worklets resolution.
---

The Vercel pnpm install can fail during Expo static rendering if `react-native-worklets` cannot resolve `@babel/types` or `@babel/generator` from the workspace root, even when Metro can resolve them locally.

**Why:** The worklets Babel plugin resolves these packages from its pnpm virtual-store location, so mobile-only or transitive declarations may not be visible in the same way after a clean Vercel install.

**How to apply:** Keep the required Babel packages explicitly declared in the root workspace dependencies and verify the exact Vercel build command after dependency cleanup.