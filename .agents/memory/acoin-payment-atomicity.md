---
name: ACoin payment atomicity pattern
description: Rules for atomic ACoin balance changes — which RPC to call, when to use fallback, how to handle refunds.
---

## Rule
ALL ACoin balance changes must go through Supabase RPCs, never direct `.update({acoin:...})`:
- **Deduct**: `supabase.rpc("deduct_acoin", { p_user_id, p_amount }).maybeSingle()`
- **Credit** (reward / refund): `supabase.rpc("credit_acoin", { p_user_id, p_amount }).catch(() => {})`

## Multi-record purchase and escrow flows

A balance RPC followed by separate order, item, inventory, or escrow writes is still not one atomic transaction. If the live database has no single server-side operation for the complete purchase/release/refund, fail closed before changing any row. Do not use sequential direct balance updates or compensating writes as a substitute.

**Why:** a later order or escrow write can fail after money has moved, leaving balances and business records inconsistent.

**How to apply:** Before enabling a multi-record ACoin flow, verify that one existing server-side transaction covers every required write. If it does not, keep the action unavailable and explain that no balance or order state changed.

## Nexa (xp) exception
There is NO `deduct_nexa` RPC. Nexa deductions still use:
```ts
.update({ xp: currentXp - amt }).eq("id", uid).gte("xp", amt)
```
The `.gte()` guard provides conditional atomicity. Consistent with entire codebase.

## Refund pattern (on failure after successful deduction)
```ts
await supabase.rpc("credit_acoin", { p_user_id: user.id, p_amount: price }).catch(() => {});
showAlert("Error", "...");
return;
```
The `.catch(() => {})` prevents an uncaught rejection from masking the original error to the user.

## Fallback in gift send (chat/[id].tsx)
Primary: `deduct_acoin` RPC. If that fails, fallback uses `.update().gte("acoin", price)` with conditional check.
This is acceptable — both approaches prevent overdraft.

## getDaysRemaining / cooldown bypass
`parseInt(storedMs, 10)` can return NaN if MMKV has corrupted data. Always guard:
```ts
const ts = parseInt(storedMs, 10);
if (!Number.isFinite(ts)) return 0;  // prevents NaN > 0 == false bypass
```

**Why:** Without the guard, `NaN > 0` evaluates to `false`, making the cooldown check always pass (lock bypassed).

**How to apply:** Any numeric value read from MMKV/AsyncStorage that drives a security/business rule must be validated with `Number.isFinite` before use.

## Files fixed in this audit
- `app/wallet/scan.tsx` — deduct_acoin/credit_acoin
- `modules/afupay/index.tsx` — deduct_acoin/credit_acoin (ACoin branch)
- `lib/serviceTransactions.ts` — deduct_acoin/credit_acoin
- `app/premium.tsx` — deduct_acoin/credit_acoin for subscription purchase
- `app/chat/[id].tsx` — deduct_acoin/credit_acoin for wallet transfers and gift refunds
- `app/gifts/marketplace.tsx` — full deduct_acoin/credit_acoin for marketplace purchase flow
- `app/profile/edit.tsx` — Number.isFinite guard on handle lock parseInt
