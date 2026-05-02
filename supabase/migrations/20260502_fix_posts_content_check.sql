-- The posts table was originally designed for text-only posts, so the
-- `content` column is NOT NULL with a CHECK constraint that rejects
-- empty strings. This breaks video and article posts where a caption
-- or body is intentionally optional.
--
-- This migration makes `content` nullable for all posts and relaxes the
-- check constraint so it only enforces non-empty text for plain 'post'
-- type rows.

-- Step 1: Allow NULL values on the content column.
ALTER TABLE public.posts
  ALTER COLUMN content DROP NOT NULL;

-- Step 2: Replace the constraint so that:
--   - Regular text posts (post_type = 'post') still require non-empty content.
--   - Video and article posts may have NULL or any string (empty caption is fine).
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_content_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_content_check CHECK (
    post_type IN ('article', 'video')
    OR (content IS NOT NULL AND length(trim(content)) > 0)
  );
