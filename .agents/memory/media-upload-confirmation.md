---
name: Media upload confirmation
description: Failure handling between the R2 byte write and AfuCloud metadata confirmation
---

An attachment whose R2 write has returned success must not be reported as failed solely because the follow-up metadata confirmation returns a transient 5xx. The canonical AfuCloud object URL is still usable; metadata repair can happen separately.

**Why:** The upload and metadata operations are separate requests. Treating confirmation as the upload itself caused users to lose otherwise valid media when the storage database returned the generic worker 500.

**How to apply:** Keep auth, validation, and byte-write failures fatal. For confirmation-only 5xx responses, log the request ID and return the object URL built from the confirmed key.