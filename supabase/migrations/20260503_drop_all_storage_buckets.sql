-- ─────────────────────────────────────────────────────────────────────────────
-- Drop ALL Supabase Storage objects and buckets.
--
-- Cloudflare R2 (cdn.afuchat.com) is the ONLY storage backend.
-- Supabase Storage is fully decommissioned — no buckets must exist.
--
-- This migration is safe to run multiple times (idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove any remaining objects (files) stored in Supabase Storage
DELETE FROM storage.objects;

-- Remove all bucket definitions — prevents any new uploads landing here
DELETE FROM storage.buckets;
