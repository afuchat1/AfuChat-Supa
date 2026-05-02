-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Storage: fully decommissioned.
--
-- All media lives exclusively on Cloudflare R2 (cdn.afuchat.com).
-- Supabase Storage must never be used again.
--
-- What was done:
--   1. All 22 Supabase Storage buckets were emptied and deleted via the
--      Supabase Storage REST API (bucket deletion requires the API, not SQL).
--      Buckets deleted: avatars, stories, profile-banners, post-images,
--      verification-documents, voice-messages, group-avatars, listing-images,
--      mini-programs, mini-app-apks, developer-showcase, ai-chat-attachments,
--      ai-generated-images, afumail-attachments, chat-attachments, shop-media,
--      match-photos, videos, product-images, event-images, restaurant-images,
--      service-images.
--   2. All RLS policies on storage.objects were dropped (see below).
--   3. mediaUpload.ts now routes all uploads through the `uploads` Supabase
--      Edge Function → Cloudflare R2. No code path touches Supabase Storage.
--
-- This SQL migration drops any remaining storage.objects RLS policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all known named policies (idempotent)
DROP POLICY IF EXISTS "Videos are publicly accessible"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own videos"           ON storage.objects;

-- Drop any additional policies that may exist (catches dashboard-created ones)
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
