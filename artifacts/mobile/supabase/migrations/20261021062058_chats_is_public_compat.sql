-- Compatibility for existing mobile clients that still query chats.is_public.
-- For chats, public visibility is the inverse of is_private. This is generated
-- so clients cannot create conflicting visibility values.
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS is_public boolean
  GENERATED ALWAYS AS (NOT COALESCE(is_private, true)) STORED;

CREATE INDEX IF NOT EXISTS chats_public_groups_updated_idx
  ON public.chats (updated_at DESC)
  WHERE is_group = true AND is_channel = false AND is_public = true;

NOTIFY pgrst, 'reload schema';