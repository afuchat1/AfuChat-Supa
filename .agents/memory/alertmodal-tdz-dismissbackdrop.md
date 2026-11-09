---
name: AlertModal TDZ — dismissBackdrop / cancelBtn ordering
description: AlertModal ErrorBoundary crash caused by useCallback capturing a TDZ binding; fix is declaration order.
---

## Rule
In `AlertModal.tsx`, `buttons` and `cancelBtn` MUST be declared BEFORE the `dismissBackdrop` useCallback that closes over `cancelBtn`.

## Why
`dismissBackdrop` has `cancelBtn` in its dependency array: `useCallback(() => dismiss(cancelBtn), [dismiss, cancelBtn])`. React evaluates the dependency array synchronously when the component renders. If `cancelBtn` is a `const` declared on a later line, it is in the TDZ at that point → throws "Cannot access 'cancelBtn' before initialization" → caught by the nearest ErrorBoundary.

This is a specific instance of the general [react-hook-tdz-production](react-hook-tdz-production.md) pattern.

## How to apply
Any time you add a `useCallback` (or `useEffect`) whose dependency array or body references a value computed lower in the component body, hoist that value above the hook. In AlertModal: `buttons` → `cancelBtn` → `useVertical` → `dismissBackdrop` — this ordering is now enforced.
