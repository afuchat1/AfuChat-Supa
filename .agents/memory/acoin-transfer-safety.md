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

The legacy `deduct_acoin` RPC has no request ID. Repeated same-amount calls can debit more than once while `credit_acoin` consumes only one matching intent. Do not reject every outstanding intent: older purchase flows also call `deduct_acoin` and may not consume a transfer intent.

**Why:** A legacy send can leave the sender charged twice while the recipient is credited once; blindly treating every pending intent as a transfer would break unrelated purchases.

**How to apply:** Keep duplicate protection scoped to a short same-sender/same-amount retry window, preserve the old RPC signatures, and never refund an expired intent without matching it to a verified transaction.

Incoming payment-request acceptance must show a review step before payment. Transfer and request completion must be atomic; declining must change only the request status.

**Why:** The user chose “Review, then pay” for incoming wallet requests, and retrying an accepted request must never charge twice.

**How to apply:** Use an authenticated server-side operation that locks the pending request, verifies its recipient, performs the selected-currency transfer, and completes the request in one transaction. Keep decline separate from wallet balance changes.
