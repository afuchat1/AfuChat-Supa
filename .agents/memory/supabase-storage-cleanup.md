---
name: Supabase Storage cleanup
description: Constraint for deleting Supabase Storage objects from scheduled database jobs
---

Supabase protects `storage.objects` from direct SQL deletion. Expiry jobs must use an admin Supabase client in an Edge Function and call `storage.from(bucket).remove(paths)`, then delete the related database rows. A pg_cron job can invoke the Edge Function through pg_net.

**Why:** A direct `DELETE FROM storage.objects` raises `Direct deletion from storage tables is not allowed`, leaving the cleanup job unable to remove expired content.

**How to apply:** Keep the database migration responsible for scheduling the Edge Function, not for deleting Storage rows directly.