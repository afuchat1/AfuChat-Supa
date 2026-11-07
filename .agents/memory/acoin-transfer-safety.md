---
name: ACoin transfer safety
description: Database permission and atomicity rules for user-to-user ACoin transfers.
---

Never grant authenticated clients execution on the generic `credit_acoin(user_id, amount)` routine when it can increment an arbitrary profile balance without checking `auth.uid()` or validating the amount.

**Why:** The permission gap caused app-side recipient credits and best-effort refunds to fail. The prior client sequence could debit first, fail to credit, ignore a failed refund, and write no ledger row for the failed attempt.

**How to apply:** Use a SECURITY DEFINER transfer routine that derives the sender from `auth.uid()`, validates both accounts and a positive amount, locks wallets in a stable order, and commits both balance changes and ledger rows atomically. Grant that routine only to `authenticated` and have the client call it once. Audit prior failures separately because the old flow may leave no transfer record.

Older AfuChat app builds may remain in use and continue calling the legacy two-RPC transfer sequence. Preserve its existing RPC signatures and make database-side history changes visible to installed clients without requiring an app update.

**Why:** The user explicitly requires older builds to keep working and receiving wallet history while avoiding a client update.

**How to apply:** Keep debit authorization intact, preserve legacy RPC contracts, and verify that both sender and recipient entries appear through the existing transaction-history queries.
