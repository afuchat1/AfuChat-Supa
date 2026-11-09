---
name: React hook TDZ in production bundles
description: useCallback/const hooks used in useEffect deps before their declaration cause TDZ crash in minified production builds
---

## Rule
In a React component function body, every `const fn = useCallback(...)` that appears in a `useEffect` dependency array MUST be declared BEFORE that `useEffect` in source order.

**Why:** JavaScript `const` declarations create a Temporal Dead Zone (TDZ) — the variable exists but is inaccessible until the declaration line executes. When the component function body runs top-to-bottom, any reference to a `const` in a deps array (`[..., fn]`) is evaluated immediately. If `fn` is declared further down in the same function, it's still in TDZ at that point. Dev builds often escape this (Babel may hoist or use `var`), but production minifiers preserve TDZ semantics → `ReferenceError: Cannot access 'oe' before initialization` (minified name).

**How to apply:** Any time you add a new `useCallback` that goes into an existing `useEffect` dep array, place the `useCallback` block ABOVE the `useEffect` in the file. Same applies to `useMemo`. If a hook is only called inside other callbacks (not dep arrays), order doesn't matter.

**Example seen:** `loadPhoneContacts` (const, line 318) referenced in `useEffect` deps (line 262) in `app/chat/new.tsx`. In production bundle this minified to `oe` and crashed with TDZ error. Fix: moved `loadPhoneContacts` above the `useEffect`.
