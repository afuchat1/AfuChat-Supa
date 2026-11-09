---
name: ACoin payment atomicity pattern
description: Rules for atomic ACoin balance changes — which RPC to call, when to use fallback, how to handle refunds.
---

## Rule
ALL ACoin balance changes must go through Supabase RPCs, never direct `.update({acoin:...})`:
- **Deduct**: `supabase.rpc("deduct_acoin", { p_user_id, p_amount }).maybeSingle()`
- **Credit** (reward / refund): `supabase.rpc("credit_acoin", { p_user_id, p_amount }).catch(() => {})`

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

## Live production RPC grant warning
On 2026-10-13, the live `credit_acoin` and `deduct_acoin` functions were executable by `anon` and `authenticated`. `credit_acoin` had no caller check; `deduct_acoin` checked that a session existed but did not require `auth.uid() = p_user_id`. Existing client flows call these functions directly to pay or credit other users.

Both functions only update `profiles.acoin`; neither writes `acoin_transactions`. `credit_acoin` returns void, while `deduct_acoin` returns JSONB.

**Why:** Broadly revoking these grants without replacing each transfer, gift, marketplace, premium, and service-payment path would break legitimate transactions, while leaving them open permits unauthorized balance changes.

**How to apply:** Audit function ACLs and caller identity in production before treating ACoin as secure. If a workflow needs a financial ledger, write its entries in the same transactional function. Replace direct cross-user client calls with scoped atomic server RPCs before removing the broad grants.

## Files fixed in this audit
- `app/wallet/scan.tsx` — deduct_acoin/credit_acoin
- `modules/afupay/index.tsx` — deduct_acoin/credit_acoin (ACoin branch)
- `lib/serviceTransactions.ts` — deduct_acoin/credit_acoin
- `app/premium.tsx` — deduct_acoin/credit_acoin for subscription purchase
- `app/chat/[id].tsx` — deduct_acoin/credit_acoin for wallet transfers and gift refunds
- `app/gifts/marketplace.tsx` — full deduct_acoin/credit_acoin for marketplace purchase flow
- `app/profile/edit.tsx` — Number.isFinite guard on handle lock parseInt
