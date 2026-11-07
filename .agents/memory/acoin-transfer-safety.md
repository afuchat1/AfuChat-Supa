---
name: ACoin transfer safety
description: Database permission and atomicity rules for user-to-user ACoin transfers.
---

Never grant authenticated clients execution on the generic `credit_acoin(user_id, amount)` routine when it can increment an arbitrary profile balance without checking `auth.uid()` or validating the amount.

**Why:** The permission gap caused app-side recipient credits and best-effort refunds to fail. The prior client sequence could debit first, fail to credit, ignore a failed refund, and write no ledger row for the failed attempt.

**How to apply:** Use a SECURITY DEFINER transfer routine that derives the sender from `auth.uid()`, validates both accounts and a positive amount, locks wallets in a stable order, and commits both balance changes and ledger rows atomically. Grant that routine only to `authenticated` and have the client call it once. Audit prior failures separately because the old flow may leave no transfer record.

Older AfuChat app builds may remain in use and continue calling the legacy two-RPC transfer sequence.

**Why:** The user explicitly warned that older installed versions may still use their existing send protocol.

**How to apply:** Check deployed client RPC contracts before changing database permissions. A database migration does not update installed clients; only add legacy compatibility when it can validate the debit without allowing arbitrary credits, otherwise coordinate an app update.
