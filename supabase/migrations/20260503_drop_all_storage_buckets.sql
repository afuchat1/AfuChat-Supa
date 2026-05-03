-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Storage: all buckets and objects fully decommissioned.
--
-- Cloudflare R2 (cdn.afuchat.com) is the ONLY storage backend.
-- No Supabase Storage bucket must ever exist again.
--
-- What was done (outside of SQL — via the Storage REST API):
--   1. Each bucket was emptied:
--        POST /storage/v1/bucket/<id>/empty
--   2. All objects in each bucket were deleted:
--        DELETE /storage/v1/object/<bucket>  { prefixes: [...] }
--   3. Each bucket was deleted:
--        DELETE /storage/v1/bucket/<id>
--   Bucket deleted: avatars (the last remaining bucket)
--
-- Note: Supabase protects storage.objects and storage.buckets from direct
--   SQL deletion (trigger: storage.protect_delete). Bucket management must
--   always go through the Storage REST API, never raw SQL.
--
-- This migration documents the completed cleanup and drops any remaining
-- storage RLS policies to prevent accidental re-use.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop any remaining storage.objects RLS policies (idempotent)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

-- Drop any remaining storage.buckets RLS policies (idempotent)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'buckets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.buckets', pol.policyname);
  END LOOP;
END;
$$;
