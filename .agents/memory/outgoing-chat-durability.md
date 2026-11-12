---
name: Chat message durability
description: Keep offline chat history instant and durable across sends, incoming delivery, reconnects, and navigation.
---

Open conversations from durable local history first and fetch only new, missing, or changed messages; do not re-download bodies already stored locally. Persist incoming messages through the app-wide listener and OS-delivered background push path even when their chat is closed. Reuse the exact displayed image URI in the viewer, including a durable local file URI when already downloaded, instead of downloading again on tap. When an outgoing optimistic message is confirmed, replace its temporary UI ID with the canonical server ID and fields in the same state update before saving or reloading; merely clearing its pending flag can let local history add a second bubble.

Every server-confirmed outgoing chat message and its delivered/read timestamps must also be stored in the local persistent message store, regardless of send type. A delivery receipt is valid only after an authenticated recipient device acknowledges actual message or push receipt; FCM accepting a send and a read event are not substitutes. Let the database timestamp and validate recipient membership, and keep delivery separate from read status. Do not remove pending bubbles until sync confirms the message is committed; a failed or skipped sync is not message deletion.

**Why:** The user requires chat to feel instant and remain usable offline, with old messages and already-loaded images reused. Timestamp-only deltas can skip uncached rows, local and server IDs can otherwise render one outgoing message twice, and a push provider's send acceptance does not prove the recipient device received the message.

**How to apply:** Use the platform's durable local store (SQLite natively, persistent AsyncStorage on Expo web) before network reconciliation. Keep server backfill bounded while retaining older local history. Persist each confirmed send and server-confirmed receipt timestamp, and reconcile pending UI only from confirmed sync or persisted state.
