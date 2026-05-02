-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-delete expired stories
--
-- Stories are set to expire 24 h after creation (expires_at column).
-- This migration:
--   1. Creates a SECURITY DEFINER function that hard-deletes expired rows from
--      story_replies, story_views, and stories (in that order).
--   2. Registers a pg_cron job to call that function every hour.
--   3. Calls the function immediately so any already-expired rows are purged.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_cron (idempotent — safe to run on projects that already have it)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Cleanup function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_expired_stories()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the function owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  expired_ids UUID[];
  deleted_count INTEGER := 0;
BEGIN
  -- Collect IDs of all expired stories in one shot
  SELECT ARRAY(SELECT id FROM stories WHERE expires_at < now())
  INTO expired_ids;

  IF array_length(expired_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- 1. Replies (story_id FK — may or may not have CASCADE)
  DELETE FROM story_replies WHERE story_id = ANY(expired_ids);

  -- 2. Views (story_id FK — may or may not have CASCADE)
  DELETE FROM story_views WHERE story_id = ANY(expired_ids);

  -- 3. The stories themselves
  DELETE FROM stories WHERE id = ANY(expired_ids);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;

-- ── pg_cron schedule ──────────────────────────────────────────────────────────
-- Remove any previous schedule with the same name (idempotent re-runs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-expired-stories') THEN
    PERFORM cron.unschedule('delete-expired-stories');
  END IF;
END;
$$;

-- Run at the top of every hour
SELECT cron.schedule(
  'delete-expired-stories',   -- job name
  '0 * * * *',                -- every hour at :00
  $$SELECT delete_expired_stories()$$
);

-- ── Immediate cleanup ─────────────────────────────────────────────────────────
-- Purge rows that are already expired at migration time
SELECT delete_expired_stories();
