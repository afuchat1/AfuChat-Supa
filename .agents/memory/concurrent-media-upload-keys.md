---
name: Concurrent media upload keys
description: Prevents parallel media uploads from overwriting one another in shared storage.
---

Parallel uploads must never derive their object key from `Date.now()` alone. Concurrent uploads can start in the same millisecond, causing multiple files to share one storage key and making a grouped message contain repeated URLs.

**Why:** A multi-image chat upload once sent repeated copies because several Promise.all uploads used the same timestamp-based filename; the last object overwrote the earlier ones.

**How to apply:** Add a random or otherwise unique suffix to generated filenames, preserve Promise.all ordering, and validate that the returned URL count exactly matches the selected media count before inserting a grouped message.